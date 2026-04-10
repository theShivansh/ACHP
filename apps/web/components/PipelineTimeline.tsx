'use client';

const PIPELINE_STEPS = [
  { id: 'security_pre',        label: 'Security Pre',   group: 'single'   },
  { id: 'retriever',           label: 'Retriever',      group: 'single'   },
  { id: 'proposer',            label: 'Proposer',       group: 'single'   },
  { id: 'adversary_a',         label: 'Adversary A',    group: 'parallel' },
  { id: 'adversary_b',         label: 'Adversary B',    group: 'parallel' },
  { id: 'debate_nil_parallel', label: 'NIL Layer',      group: 'parallel' },
  { id: 'judge',               label: 'Judge Council',  group: 'single'   },
  { id: 'security_post',       label: 'Security Post',  group: 'single'   },
];

function fmtMs(ms: number) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface PipelineTimelineProps {
  latencies: Record<string, number>;
  totalMs: number;
  models: Record<string, string>;
  cacheHit: boolean;
}

export default function PipelineTimeline({ latencies, totalMs, models, cacheHit }: PipelineTimelineProps) {
  const max = Math.max(...Object.values(latencies).filter(Boolean), 1);

  return (
    <section
      style={{
        background: '#1c1b1b',
        border: '1px solid rgba(255,255,255,0.05)',
        padding: '20px',
      }}
      className="unit-stagger delay-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h3
          className="font-bold uppercase"
          style={{
            fontSize: 9,
            letterSpacing: '0.25em',
            color: 'rgba(255,255,255,0.40)',
            fontFamily: 'Space Grotesk, sans-serif',
          }}
        >
          Pipeline Execution Timeline
        </h3>
        <div className="flex items-center gap-3">
          {cacheHit && (
            <span style={{ fontSize: 9, color: '#FED639', fontFamily: 'JetBrains Mono' }}>⚡ CACHE HIT</span>
          )}
          <span style={{ fontSize: 9, color: '#00F0FF', fontFamily: 'JetBrains Mono' }}>
            Total: {fmtMs(totalMs)}
          </span>
        </div>
      </div>

      {/* Step rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PIPELINE_STEPS.map(step => {
          const ms  = latencies[step.id] ?? 0;
          const pct = ms > 0 ? Math.max(3, (ms / max) * 100) : 0;
          const isPar = step.group === 'parallel';

          return (
            <div key={step.id} className="flex items-center gap-3">
              {/* Label */}
              <span
                style={{
                  width: 100,
                  fontSize: 8,
                  color: 'rgba(255,255,255,0.30)',
                  fontFamily: 'JetBrains Mono, monospace',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  flexShrink: 0,
                }}
              >
                {step.label}
              </span>
              {/* Bar */}
              <div
                className="flex-1"
                style={{ height: 12, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}
              >
                {ms > 0 && (
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: isPar
                        ? 'linear-gradient(90deg, #A100F0, rgba(161,0,240,0.5))'
                        : 'linear-gradient(90deg, #00F0FF, rgba(0,240,255,0.5))',
                      transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                    }}
                  />
                )}
              </div>
              {/* Time */}
              <span
                style={{
                  width: 40,
                  textAlign: 'right',
                  fontSize: 8,
                  color: 'rgba(255,255,255,0.25)',
                  fontFamily: 'JetBrains Mono, monospace',
                  flexShrink: 0,
                }}
              >
                {ms > 0 ? fmtMs(ms) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Models used */}
      {Object.keys(models ?? {}).length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p
            className="uppercase"
            style={{ fontSize: 8, color: 'rgba(255,255,255,0.20)', letterSpacing: '0.1em', marginBottom: 6, fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Models Used:
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(models).map(([agent, model]) => (
              <span key={agent} style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono' }}>
                <span style={{ color: 'rgba(255,255,255,0.40)' }}>{agent}:</span> {model}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
