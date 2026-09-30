'use client';

import { useState, useCallback, useRef, createContext, useEffect, useMemo } from 'react';
import type { ACHPOutput, QAResponse } from '@/lib/types';
import { downloadEventsJson, downloadFullReport } from '@/lib/exportReport';
import { createAnnouncer } from '@/lib/runs/announcer';
import { fetchEventsJsonText, fetchRun, startRun } from '@/lib/runs/api';
import { lanes, type RunState } from '@/lib/runs/reducer';
import type { RunEvent } from '@/lib/runs/types';
import { useRunEvents } from '@/lib/runs/useRunEvents';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import QueryInput from '@/components/QueryInput';
import VerdictCard from '@/components/VerdictCard';
import { Hallmark } from '@/components/assay/Hallmark';
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
// TRACE tab — the latest run's real event log (S1.5). Rows = events; export = events.json verbatim.
// ─────────────────────────────────────────────────────────────────────────────
function TraceView({ run }: { run: RunState }) {
  const [exportError, setExportError] = useState<string | null>(null);

  if (!run.runId || !run.events.length) {
    return (
      <p className="py-16 text-center text-sm text-desk-ink-2">
        No trace yet. Check a claim and its event log appears here.
      </p>
    );
  }

  const exportJson = async () => {
    setExportError(null);
    try {
      downloadEventsJson(run.runId!, await fetchEventsJsonText(run.runId!));
    } catch {
      setExportError('The event log could not be downloaded. Try again in a moment.');
    }
  };

  return (
    <section aria-label="Trace" className="text-desk-ink">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          Run {run.runId} · {run.events.length} events
        </p>
        <button
          type="button"
          onClick={exportJson}
          className="min-h-11 rounded-md border border-desk-line px-3 text-sm hover:bg-desk-raised focus-visible:outline-2"
        >
          Export events.json
        </button>
      </div>
      {exportError && (
        <p role="alert" className="mb-2 text-sm text-desk-red">
          {exportError}
        </p>
      )}
      <ol className="max-h-[32rem] overflow-y-auto rounded-md border border-desk-line bg-desk-raised font-mono text-xs">
        {run.events.map((e) => (
          <li key={e.seq} data-seq={e.seq} className="grid grid-cols-[3rem_5rem_9rem_1fr] gap-2 border-b border-desk-line px-3 py-1.5">
            <span className="text-desk-ink-2">{e.seq}</span>
            <span className="text-desk-ink-2">{(e.t_ms / 1000).toFixed(2)}s</span>
            <span>{e.type}</span>
            <span className="truncate text-desk-ink-2">
              {e.agent ? `${e.agent} · ` : ''}
              {JSON.stringify(e.data)}
            </span>
          </li>
        ))}
      </ol>
    </section>
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
      {result.pipeline?.mode === 'demo' && (
        <p role="note" className="rounded-md border border-desk-ochre px-4 py-3 text-sm font-medium text-desk-ochre">
          Demo data: sample output for trying the interface. Nothing was checked.
        </p>
      )}
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
          {/* The radar hid direction, reuse and disagreement (11 §2.5); the Hallmark replaces it. This legacy view
              is retired in P9; the new report is /case/[id]. */}
          <div className="paper rounded-sheet p-4">
            <Hallmark metrics={result.metrics} size={28} />
          </div>
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
  const [activeTab,    setActiveTab]    = useState<'dashboard' | 'monitor' | 'trace'>('dashboard');
  const [runId,        setRunId]        = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const queryInputRef = useRef<HTMLDivElement>(null);

  const result = activeResult;

  // ── Live run: every progress line on this page is a server event (06 §1) ──
  const announcer = useMemo(() => createAnnouncer(setAnnouncement), []);
  useEffect(() => () => announcer.dispose(), [announcer]);

  const onRunEvents = useCallback((events: RunEvent[]) => {
    for (const e of events) {
      announcer.push(e);
      if (e.type === 'run.completed') {
        fetchRun(e.run_id)
          .then(snap => {
            if (!snap.result) throw new Error('The run finished without a stored result.');
            const data = mapFastAPIResponse(snap.result);
            setActiveResult(data);
            setResults(prev => [data, ...prev]);
          })
          .catch(err => setError(err instanceof Error ? err.message : 'The result could not be loaded.'))
          .finally(() => setIsRunning(false));
      }
      if (e.type === 'run.failed') {
        setError(e.data.message);
        setIsRunning(false);
      }
    }
  }, [announcer]);

  const { state: run, connection, retry } = useRunEvents(runId, {}, onRunEvents);

  // The sidebar keys its NIL sub-checks separately; they run in the nil_supervisor lane.
  const { activeAgents, doneAgents, laneModels } = useMemo(() => {
    const active = new Set<string>();
    const done = new Set<string>();
    const models: Record<string, string | null> = {};
    const nilParts = ['sentiment', 'bias', 'perspective', 'framing'];
    for (const l of lanes(run)) {
      const keys = l.id === 'nil_supervisor' ? [l.id, ...nilParts] : [l.id];
      if (l.state === 'working' || l.state === 'waiting') keys.forEach(k => active.add(k));
      if (l.state === 'done') keys.forEach(k => done.add(k));
      models[l.id] = l.servedBy ?? l.model;
    }
    return { activeAgents: active, doneAgents: done, laneModels: models };
  }, [run]);

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

  // ── Export — uses shared full-detail report utility ──
  const handleExport = useCallback(() => {
    if (!activeResult) return;
    downloadFullReport(activeResult);
  }, [activeResult]);

  const handleScrollToQuery = useCallback(() => {
    queryInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // ── Main run handler: POST /runs, then the event log drives the page ──
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
    setActiveTab('dashboard');

    // Demo data only with ?demo=1 (watermarked in AnalyzedState); never as a fallback.
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      try {
        const r = await fetch('/api/analyze?demo=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const demo = (await r.json()) as ACHPOutput;
        setActiveResult(demo);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Demo data could not be loaded.');
      } finally {
        setIsRunning(false);
      }
      return;
    }

    try {
      const created = await startRun(query, activeKbId);
      setRunId(created.run_id);
    } catch (e) {
      setRunId(null);
      setError(
        e instanceof TypeError
          ? 'The checker could not be reached, so nothing was checked. Try again in a moment.'
          : e instanceof Error ? e.message : 'The check could not start.',
      );
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
        {/* Every visible progress change is also announced (ACHP is silent; 06 §7) */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
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
              models={laneModels}
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
                    {activeTab === 'monitor' ? 'Monitor' : activeTab === 'trace' ? 'Trace' : 'Dashboard'}
                  </h1>
                  <p style={{
                    fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    fontFamily: 'Space Grotesk, sans-serif',
                  }}>
                    {activeTab === 'monitor'
                      ? `Analysis History — ${results.length} run${results.length !== 1 ? 's' : ''} recorded`
                      : activeTab === 'trace'
                      ? `Event log of the latest run — ${run.events.length} events`
                      : isRunning
                      ? 'Processing claim through 7-agent pipeline…'
                      : isAnalyzed
                      ? 'Narrative Integrity Analysis — Complete'
                      : 'Narrative Integrity Analysis System'}
                  </p>
                </div>

                {/* Monitor tab */}
                {activeTab === 'monitor' && <MonitorView results={results} />}

                {/* Trace tab: the real event log */}
                {activeTab === 'trace' && <TraceView run={run} />}

                {/* Dashboard tab */}
                {activeTab === 'dashboard' && (
                  <>
                    {runId && (isRunning || run.status === 'failed') && (
                      <PipelineProgress run={run} connection={connection} onRetry={retry} />
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
  // A result without a verdict is not shown with an invented one (non-negotiable 4).
  const tr0 = raw.transparency_report as Record<string, unknown> | undefined;
  const numbers = [raw.verdict_confidence, tr0?.composite_score, tr0?.cts, tr0?.pcs, tr0?.bis, tr0?.nss, tr0?.eps];
  if (typeof raw.verdict !== 'string' || !tr0 || numbers.some((n) => typeof n !== 'number')) {
    throw new Error('The result came back incomplete, so no verdict is shown.');
  }
  const tr = (raw.transparency_report as Record<string, unknown>) ?? {};
  const arts = (raw.artifacts as Record<string, unknown>) ?? {};
  const nil = (tr.nil_sub_agents as Record<string, unknown>) ?? {};
  const latency = (tr.latency_ms as Record<string, number>) ?? {};

  return {
    run_id: (raw.run_id as string) ?? '',
    timestamp: (raw.timestamp as string) ?? new Date().toISOString(),
    input: (raw.claim as string) ?? '',
    verdict: raw.verdict as ACHPOutput['verdict'],
    verdict_confidence: raw.verdict_confidence as number,
    composite_score: tr.composite_score as number,
    metrics: {
      CTS: tr.cts as number,
      PCS: tr.pcs as number,
      BIS: tr.bis as number,
      NSS: tr.nss as number,
      EPS: tr.eps as number,
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
    debate_rounds: (tr.debate_rounds as number) ?? 0,
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
