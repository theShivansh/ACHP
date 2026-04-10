'use client';
import { useEffect, useRef, useState } from 'react';

// ── Pipeline step definitions with weights (must sum to 100) ──────────────────
// Weights reflect real-world time contribution observed from pipeline runs
const STEPS = [
  { id: 'security',       label: 'SECURITY',  weight: 2  },
  { id: 'retriever',      label: 'RETRIEVE',  weight: 12 },
  { id: 'proposer',       label: 'PROPOSE',   weight: 15 },
  { id: 'adversary_a',    label: 'ADVERSARY A',weight: 14 },
  { id: 'adversary_b',    label: 'ADVERSARY B',weight: 14 },
  { id: 'nil_supervisor', label: 'NIL',       weight: 30 },
  { id: 'judge',          label: 'JUDGE',     weight: 10 },
  { id: 'done',           label: 'OUTPUT',    weight: 3  },
];

// Cumulative weight thresholds for each stage completion
const CUMULATIVE = STEPS.reduce<number[]>((acc, s, i) => {
  acc.push((acc[i - 1] ?? 0) + s.weight);
  return acc;
}, []);

interface PipelineProgressProps {
  activeAgents: Set<string>;
  doneAgents:   Set<string>;
  isRunning:    boolean;
  runId?:       string;  // When provided, connect to SSE for real events
}

export default function PipelineProgress({
  activeAgents,
  doneAgents,
  isRunning,
  runId,
}: PipelineProgressProps) {
  const [displayPct, setDisplayPct] = useState(0);
  const [currentLabel, setCurrentLabel] = useState('Initializing…');
  const [pulsingId, setPulsingId]     = useState<string | null>(null);
  const animRef = useRef<number | null>(null);
  const targetRef = useRef(0);

  // ── Smooth progress animation ──────────────────────────────────────────────
  useEffect(() => {
    // Calculate target from done + active agents
    let target = 0;
    let activeStep: typeof STEPS[0] | null = null;

    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      if (doneAgents.has(s.id)) {
        target = CUMULATIVE[i];
      } else if (activeAgents.has(s.id)) {
        // In-progress: advance halfway through this step's weight
        target = (CUMULATIVE[i - 1] ?? 0) + s.weight * 0.5;
        activeStep = s;
        break;
      }
    }

    // Cap at 92% while still running (final jump to 100 when done)
    if (isRunning) target = Math.min(target, 92);
    else if (!isRunning && doneAgents.size > 0) target = 100;

    targetRef.current = target;

    // Update label
    if (activeStep) {
      const labels: Record<string, string> = {
        security:       'Running security pre-check…',
        retriever:      'Fetching evidence from web & KB…',
        proposer:       'Decomposing claim into atomic units…',
        adversary_a:    'Adversary A: factual challenge…',
        adversary_b:    'Adversary B: narrative audit…',
        nil_supervisor: 'NIL Layer: 5-agent integrity scan…',
        judge:          'Judge council synthesizing verdict…',
        done:           'Finalizing output…',
      };
      setCurrentLabel(labels[activeStep.id] ?? `${activeStep.label} running…`);
      setPulsingId(activeStep.id);
    } else if (!isRunning && doneAgents.size > 0) {
      setCurrentLabel('Pipeline complete');
      setPulsingId(null);
    } else if (isRunning) {
      setCurrentLabel('Starting pipeline…');
    }

    // Animate display toward target
    const animate = () => {
      setDisplayPct(prev => {
        const diff = targetRef.current - prev;
        if (Math.abs(diff) < 0.3) return targetRef.current;
        // Ease: fast when far behind, slow when close
        const step = diff > 0 ? Math.max(0.15, diff * 0.06) : diff * 0.06;
        return Math.round((prev + step) * 10) / 10;
      });
      animRef.current = requestAnimationFrame(animate);
    };

    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(animate);

    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [activeAgents, doneAgents, isRunning]);

  // ── In-progress "creep" — slowly advance while an agent is running ──────────
  // Adds a subtle automatic increment every 2s so bar never looks frozen
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setDisplayPct(prev => {
        const t = targetRef.current;
        if (prev < t - 1) return prev + 0.4;
        return prev;
      });
    }, 800);
    return () => clearInterval(interval);
  }, [isRunning]);

  if (!isRunning && activeAgents.size === 0 && doneAgents.size === 0) return null;

  const pct = Math.min(100, Math.max(0, displayPct));
  const isComplete = !isRunning && doneAgents.size > 0;

  // Gradient shifts from purple→cyan (working) to full cyan (done)
  const barGradient = isComplete
    ? 'linear-gradient(90deg, #00F0FF, #00F0FF)'
    : `linear-gradient(90deg, #A100F0 0%, #00F0FF ${pct + 10}%)`;

  return (
    <div style={{
      border: `1px solid ${isComplete ? 'rgba(0,240,255,0.30)' : 'rgba(0,240,255,0.15)'}`,
      background: 'rgba(14,14,14,0.70)',
      padding: '16px 16px 12px',
      transition: 'border-color 0.5s',
    }}>
      {/* Header row */}
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        {/* Live pulse dot */}
        <div style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: isComplete ? '#00F0FF' : '#00F0FF',
          boxShadow: isComplete ? '0 0 8px #00F0FF' : '0 0 5px #00F0FF',
          animation: isRunning ? 'pulse 1.2s ease-in-out infinite' : 'none',
          flexShrink: 0,
        }} />

        {/* Status label */}
        <span className="uppercase font-bold" style={{
          fontSize: 9, letterSpacing: '0.22em',
          color: '#00F0FF', fontFamily: 'Space Grotesk, sans-serif',
          flex: 1,
        }}>
          {isComplete ? 'PIPELINE COMPLETE' : 'GLOBAL PIPELINE COMPLETION'}
        </span>

        {/* Percentage */}
        <span className="font-bold" style={{
          fontSize: 15, color: '#00F0FF',
          fontFamily: 'JetBrains Mono, monospace',
          minWidth: 42, textAlign: 'right',
        }}>
          {Math.round(pct)}%
        </span>
      </div>

      {/* Running stage label */}
      {!isComplete && (
        <div style={{
          fontSize: 10, color: 'rgba(0,240,255,0.55)',
          fontFamily: 'JetBrains Mono, monospace',
          marginBottom: 8, letterSpacing: '0.04em',
          minHeight: 14,
        }}>
          {currentLabel}
        </div>
      )}

      {/* Progress bar */}
      <div style={{
        height: 3, background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden', marginBottom: 14,
        position: 'relative',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: barGradient,
          transition: 'width 0.25s linear, background 0.5s',
          position: 'relative',
        }}>
          {/* Shimmer head */}
          {isRunning && (
            <div style={{
              position: 'absolute', right: 0, top: 0,
              width: 30, height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6))',
              animation: 'shimmer-head 1.5s ease-in-out infinite',
            }} />
          )}
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex" style={{ justifyContent: 'space-between', gap: 2 }}>
        {STEPS.map((step, i) => {
          const isActive = activeAgents.has(step.id) || pulsingId === step.id;
          const isDone   = doneAgents.has(step.id) || isComplete;
          const isPulse  = isActive && isRunning;

          return (
            <div key={step.id} className="flex flex-col items-center" style={{ gap: 5, flex: 1 }}>
              {/* Step circle */}
              <div style={{
                width: 22, height: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8,
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 700,
                border: `1px solid ${
                  isPulse ? '#00F0FF'
                  : isDone ? 'rgba(0,240,255,0.35)'
                  : 'rgba(255,255,255,0.09)'
                }`,
                background: isPulse
                  ? 'rgba(0,240,255,0.12)'
                  : isDone
                  ? 'rgba(0,240,255,0.05)'
                  : 'transparent',
                color: isPulse || isDone ? '#00F0FF' : 'rgba(255,255,255,0.18)',
                boxShadow: isPulse ? '0 0 8px rgba(0,240,255,0.4)' : 'none',
                animation: isPulse ? 'pulse-border 1.5s ease-in-out infinite' : 'none',
                transition: 'all 0.3s ease',
              }}>
                {isDone && !isPulse ? '✓' : i + 1}
              </div>

              {/* Label */}
              <span style={{
                fontSize: 7,
                letterSpacing: '0.04em',
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 700,
                textTransform: 'uppercase',
                textAlign: 'center',
                color: isPulse
                  ? '#00F0FF'
                  : isDone
                  ? 'rgba(255,255,255,0.28)'
                  : 'rgba(255,255,255,0.13)',
                transition: 'color 0.3s',
              }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 5px rgba(0,240,255,0.3); }
          50%       { box-shadow: 0 0 14px rgba(0,240,255,0.7); }
        }
        @keyframes shimmer-head {
          0%   { opacity: 0.3; }
          50%  { opacity: 1;   }
          100% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
