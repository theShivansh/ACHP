'use client';
import type { ACHPOutput } from '@/lib/types';

interface PerspectivePanelProps { result: ACHPOutput; }

export default function PerspectivePanel({ result }: PerspectivePanelProps) {
  const perspectives = result.adversary_b?.missing_perspectives ?? [];
  if (!perspectives.length) return null;

  return (
    <section className="unit-stagger delay-3">
      <h3
        className="font-bold uppercase"
        style={{
          fontSize: 11,
          letterSpacing: '0.2em',
          color: 'rgba(255,255,255,0.40)',
          fontFamily: 'Space Grotesk, sans-serif',
          marginBottom: 12,
        }}
      >
        Alternative Perspectives
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 16,
        }}
      >
        {perspectives.map((p: { stakeholder: string; viewpoint: string; significance?: number }, i: number) => {
          const isEven = i % 2 === 0;
          const accentColor = isEven ? '#00F0FF' : '#e5b5ff';
          const label = isEven ? 'NEUTRAL REFORMULATION' : 'OPPOSING VIEW';

          return (
            <div
              key={i}
              className="glass-panel unit-stagger"
              style={{
                padding: '16px',
                border: '1px solid rgba(255,255,255,0.05)',
                background: '#1c1b1b',
                cursor: 'pointer',
                transition: 'border-color 0.2s',
                animationDelay: `${0.2 + i * 0.08}s`,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = isEven
                  ? 'rgba(0,240,255,0.25)'
                  : 'rgba(229,181,255,0.25)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.05)';
              }}
            >
              <span
                className="font-bold uppercase"
                style={{
                  fontSize: 9,
                  letterSpacing: '-0.01em',
                  color: accentColor,
                  fontFamily: 'Space Grotesk, sans-serif',
                }}
              >
                {label}
              </span>
              <p
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.40)',
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.60)' }}>{p.stakeholder}:</span>{' '}
                {p.viewpoint}
              </p>
              {p.significance !== undefined && (
                <div style={{ marginTop: 8, fontSize: 9, color: 'rgba(255,255,255,0.20)' }}>
                  Significance: {Math.round(p.significance * 100)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
