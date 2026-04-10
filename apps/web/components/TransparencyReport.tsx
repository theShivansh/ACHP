'use client';
import { useState } from 'react';
import type { ACHPOutput } from '@/lib/types';

interface SectionProps {
  title: string;
  borderColor: string;
  hoverTextColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function AccordionSection({ title, borderColor, hoverTextColor, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="glass-panel"
      style={{
        background: '#201f1f',
        borderLeft: `2px solid ${borderColor}`,
      }}
    >
      <button
        className="w-full flex justify-between items-center text-left group"
        onClick={() => setOpen(o => !o)}
        style={{ padding: '12px 16px' }}
      >
        <span
          className="font-bold uppercase tracking-wider transition-colors"
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.80)',
            fontFamily: 'Space Grotesk, sans-serif',
          }}
          onMouseEnter={e => ((e.target as HTMLElement).style.color = hoverTextColor)}
          onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.80)')}
        >
          {title}
        </span>
        <span
          className="material-symbols-outlined transition-transform"
          style={{
            fontSize: 16,
            color: 'rgba(255,255,255,0.20)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

interface TransparencyReportProps { result: ACHPOutput; }

export default function TransparencyReport({ result }: TransparencyReportProps) {
  const advA = result.adversary_a;
  const advB = result.adversary_b;
  const nil  = result.nil;
  const ev   = result.key_evidence;

  return (
    <section className="unit-stagger delay-3">
      <h3
        className="font-bold uppercase"
        style={{
          fontSize: 11,
          letterSpacing: '0.15em',
          color: 'rgba(255,255,255,0.60)',
          fontFamily: 'Space Grotesk, sans-serif',
          marginBottom: 8,
        }}
      >
        Transparency Report
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Adversary A */}
        {advA && (
          <AccordionSection
            title="Adversary A — Factual Challenger"
            borderColor="#00F0FF"
            hoverTextColor="#00F0FF"
            defaultOpen={true}
          >
            <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', fontFamily: 'Space Grotesk, sans-serif' }}>
                Factual Score
              </span>
              <span
                className="font-bold shimmer-badge"
                style={{
                  fontSize: 10,
                  color: (advA.factual_score ?? 0) > 0.6 ? '#00F0FF' : '#ffb4ab',
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: '0 4px',
                }}
              >
                {Math.round((advA.factual_score ?? 0) * 100)}%
              </span>
            </div>
            {advA.critical_flaws?.length > 0 && (
              <>
                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontFamily: 'Space Grotesk, sans-serif' }}>
                  Critical Flaws Identified:
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {advA.critical_flaws.map((f: string, i: number) => (
                    <li
                      key={i}
                      className="unit-stagger"
                      style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.50)',
                        lineHeight: 1.5,
                        paddingLeft: 12,
                        borderLeft: '1px solid rgba(0,240,255,0.15)',
                        marginBottom: 6,
                        animationDelay: `${i * 0.05}s`,
                      }}
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {advA.verdict && (
              <div style={{ marginTop: 8, fontSize: 9, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', fontFamily: 'Space Grotesk, sans-serif' }}>
                Verdict: <span style={{ color: '#00F0FF', fontFamily: 'JetBrains Mono' }}>{advA.verdict}</span>
              </div>
            )}
          </AccordionSection>
        )}

        {/* Adversary B */}
        {advB && (
          <AccordionSection
            title="Adversary B — Narrative Auditor"
            borderColor="#A100F0"
            hoverTextColor="#e5b5ff"
          >
            <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', fontFamily: 'Space Grotesk, sans-serif' }}>
                Perspective Score
              </span>
              <span
                className="font-bold"
                style={{
                  fontSize: 10,
                  color: '#e5b5ff',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {Math.round((advB.perspective_score ?? 0) * 100)}%
              </span>
            </div>
            {advB.narrative_stance && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', fontFamily: 'Space Grotesk, sans-serif' }}>
                  Narrative Stance:{' '}
                </span>
                <span style={{ fontSize: 10, color: '#e5b5ff', fontFamily: 'JetBrains Mono' }}>
                  {advB.narrative_stance.toUpperCase()}
                </span>
              </div>
            )}
            {advB.missing_perspectives?.length > 0 && (
              <div
                style={{
                  padding: 8,
                  background: '#1c1b1b',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <code style={{ fontSize: 10, color: '#e5b5ff', lineHeight: 1.7 }}>
                  {advB.missing_perspectives.slice(0, 2).map((p: { stakeholder: string; viewpoint: string }, i: number) => (
                    <div key={i}>
                      {p.stakeholder}: {p.viewpoint}
                    </div>
                  ))}
                </code>
              </div>
            )}
          </AccordionSection>
        )}

        {/* NIL Layer */}
        {nil && (
          <AccordionSection
            title="NIL — Narrative Integrity Layer"
            borderColor="#e5b5ff"
            hoverTextColor="#e5b5ff"
          >
            <div
              style={{
                padding: 8,
                background: '#1c1b1b',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <code style={{ fontSize: 10, color: '#e5b5ff', lineHeight: 1.9 }}>
                <div>VERDICT: {nil.verdict?.toUpperCase()}</div>
                <div>CONFIDENCE: {Math.round((nil.confidence ?? 0) * 100)}%</div>
                <div>BIS: {Math.round((nil.BIS ?? 0) * 100)}% · EPS: {Math.round((nil.EPS ?? 0) * 100)}%</div>
              </code>
            </div>
            {nil.summary && (
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 8, lineHeight: 1.5 }}>
                {nil.summary}
              </p>
            )}
          </AccordionSection>
        )}

        {/* Key Evidence */}
        {ev && (
          <AccordionSection
            title="Key Evidence"
            borderColor="rgba(255,255,255,0.10)"
            hoverTextColor="rgba(255,255,255,0.60)"
          >
            {ev.supporting?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 9, color: '#00F0FF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontFamily: 'Space Grotesk, sans-serif' }}>
                  Supporting
                </p>
                {ev.supporting.map((s: string, i: number) => (
                  <p key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', lineHeight: 1.5, marginBottom: 4 }}>
                    ▸ {s}
                  </p>
                ))}
              </div>
            )}
            {ev.contradicting?.length > 0 && (
              <div>
                <p style={{ fontSize: 9, color: '#ffb4ab', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontFamily: 'Space Grotesk, sans-serif' }}>
                  Contradicting
                </p>
                {ev.contradicting.map((s: string, i: number) => (
                  <p key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', lineHeight: 1.5, marginBottom: 4 }}>
                    ▸ {s}
                  </p>
                ))}
              </div>
            )}
          </AccordionSection>
        )}
      </div>
    </section>
  );
}
