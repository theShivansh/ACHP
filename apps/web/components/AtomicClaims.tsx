'use client';
import { useState } from 'react';
import type { ACHPOutput } from '@/lib/types';

interface AtomicClaimsProps { result: ACHPOutput; }

const TYPE_ICONS: Record<string, string> = {
  claim:    'bookmark',
  bias:     'balance',
  evidence: 'description',
  suggests: 'lightbulb',
  fact:     'verified',
};

function SourceBadge({ url, kbPage, kbName }: { url?: string | null; kbPage?: number | null; kbName?: string | null }) {
  // Web URL badge
  if (url && url.startsWith('http')) {
    let domain = url;
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }

    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open source: ${url}`}
        onClick={e => e.stopPropagation()}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
          color: '#00F0FF', textDecoration: 'none',
          background: 'rgba(0,240,255,0.07)',
          border: '1px solid rgba(0,240,255,0.20)',
          padding: '2px 7px', borderRadius: 4,
          marginTop: 5,
          transition: 'background 0.15s, border-color 0.15s',
          maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.14)';
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.45)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.07)';
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.20)';
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 10 }}>open_in_new</span>
        {domain}
      </a>
    );
  }

  // KB chunk badge
  if (typeof kbPage === 'number' && kbPage >= 0) {
    return (
      <span
        title={`Knowledge Base${kbName ? `: ${kbName}` : ''} — chunk #${kbPage}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
          color: '#e5b5ff',
          background: 'rgba(161,0,240,0.07)',
          border: '1px solid rgba(161,0,240,0.20)',
          padding: '2px 7px', borderRadius: 4,
          marginTop: 5,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 10 }}>database</span>
        {kbName ? kbName.slice(0, 20) : 'KB'} · chunk {kbPage}
      </span>
    );
  }

  return null;
}

/** Chain-of-Thought reasoning badge for unverifiable claims */
function CoTBadge({ epMarker, citations }: { epMarker?: string; citations?: string[] }) {
  const [open, setOpen] = useState(false);
  const textCits = (citations ?? []).filter(s => !s.startsWith('http'));

  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
          color: '#FED639', background: 'rgba(254,214,57,0.06)',
          border: '1px solid rgba(254,214,57,0.20)',
          padding: '2px 7px', borderRadius: 4,
          cursor: 'pointer', transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(254,214,57,0.12)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(254,214,57,0.06)'}
        title="Show chain-of-thought reasoning for this unverifiable claim"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 10 }}>psychology</span>
        CHAIN-OF-THOUGHT {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          marginTop: 6,
          padding: '8px 10px',
          background: 'rgba(254,214,57,0.04)',
          border: '1px solid rgba(254,214,57,0.12)',
          borderRadius: 4,
          fontSize: 10,
          color: 'rgba(254,214,57,0.75)',
          fontFamily: 'JetBrains Mono, monospace',
          lineHeight: 1.6,
        }}>
          <div style={{ marginBottom: 4, fontWeight: 700 }}>Reasoning:</div>
          <div>
            Epistemic marker <span style={{ color: '#FED639' }}>"{epMarker?.toUpperCase() ?? 'CLAIM'}"</span> signals this
            statement is <span style={{ color: '#FED639' }}>subjective / opinion-framed</span> and cannot be objectively
            verified against factual records. The ACHP pipeline flags it as requiring human judgment.
          </div>
          {textCits.length > 0 && (
            <div style={{ marginTop: 6, borderTop: '1px solid rgba(254,214,57,0.10)', paddingTop: 6 }}>
              <span style={{ opacity: 0.55 }}>Context clues: </span>
              {textCits.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export default function AtomicClaims({ result }: AtomicClaimsProps) {
  const claims = result.atomic_claims ?? [];
  if (!claims.length) return null;

  return (
    <section className="unit-stagger delay-2">
      {/* Section header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h3 className="font-bold uppercase" style={{
          fontSize: 11, letterSpacing: '0.2em',
          color: 'rgba(255,255,255,0.40)',
          fontFamily: 'Space Grotesk, sans-serif',
        }}>
          Atomic Narrative Units
        </h3>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.20)' }}>
          {claims.length} UNITS DETECTED
        </span>
      </div>

      <div style={{ display: 'grid', gap: 1, background: 'rgba(255,255,255,0.05)' }}>
        {claims.map((c, i) => {
          const typeLabel = c.epistemic_marker ?? 'CLAIM';
          const typeColor = typeLabel?.toLowerCase().includes('claim')
            ? '#00F0FF'
            : typeLabel?.toLowerCase().includes('fact')
            ? '#7df4ff'
            : '#e5b5ff';

          const confPct   = Math.round((c.confidence ?? 0) * 100);
          const confColor = confPct >= 80 ? '#00F0FF' : confPct >= 50 ? '#FED639' : '#ffb4ab';

          const iconKey = typeLabel?.toLowerCase().includes('bias')
            ? 'bias'
            : typeLabel?.toLowerCase().includes('evidence')
            ? 'evidence'
            : typeLabel?.toLowerCase().includes('suggest')
            ? 'suggests'
            : typeLabel?.toLowerCase().includes('fact')
            ? 'fact'
            : 'claim';

          // Extract source URL from citations: look for http/https strings
          const sourceUrl = c.source_url
            ?? c.citations?.find(s => s.startsWith('http'));

          return (
            <div
              key={c.id ?? i}
              className="unit-stagger"
              style={{
                padding: '16px',
                background: '#201f1f',
                animationDelay: `${0.1 + i * 0.1}s`,
                transition: 'background 0.2s',
                display: 'grid',
                gridTemplateColumns: '40px 1fr auto',
                gap: '0 16px',
                alignItems: 'start',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#2a2a2a')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#201f1f')}
            >
              {/* Icon box */}
              <div className="flex items-center justify-center" style={{
                width: 40, height: 40, flexShrink: 0,
                background: i % 3 === 1
                  ? 'rgba(161,0,240,0.10)'
                  : i % 3 === 2
                  ? 'rgba(255,255,255,0.03)'
                  : 'rgba(0,240,255,0.10)',
                border: i % 3 === 1
                  ? '1px solid rgba(161,0,240,0.20)'
                  : i % 3 === 2
                  ? '1px solid rgba(255,255,255,0.10)'
                  : '1px solid rgba(0,240,255,0.20)',
              }}>
                <span className="material-symbols-outlined" style={{
                  fontSize: 16,
                  color: i % 3 === 1 ? '#e5b5ff' : i % 3 === 2 ? 'rgba(255,255,255,0.40)' : '#00F0FF',
                }}>
                  {TYPE_ICONS[iconKey] ?? 'bookmark'}
                </span>
              </div>

              {/* Content + source badge */}
              <div style={{ minWidth: 0 }}>
                <div className="font-bold uppercase" style={{
                  fontSize: 10, marginBottom: 4,
                  color: typeColor,
                  fontFamily: 'Space Grotesk, sans-serif',
                  letterSpacing: '0.05em',
                }}>
                  {c.id} · {typeLabel?.toUpperCase()}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.80)', lineHeight: 1.5 }}>
                  {c.text}
                </div>

                {/* Source link OR KB citation — for VERIFIABLE claims */}
                {c.verifiable && (
                  <SourceBadge
                    url={sourceUrl}
                    kbPage={c.kb_page}
                    kbName={c.kb_name}
                  />
                )}

                {/* Fallback: non-URL citation strings — for VERIFIABLE only */}
                {c.verifiable && !sourceUrl && c.kb_page === undefined && c.citations?.filter(s => !s.startsWith('http')).length > 0 && (
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 5, fontFamily: 'JetBrains Mono, monospace' }}>
                    {c.citations.filter(s => !s.startsWith('http')).join(' · ')}
                  </div>
                )}

                {/* Chain-of-Thought badge for UNVERIFIABLE claims */}
                {!c.verifiable && (
                  <CoTBadge
                    epMarker={c.epistemic_marker}
                    citations={c.citations}
                  />
                )}
              </div>

              {/* Stats: Confidence + Verifiable */}
              <div className="flex items-center gap-6 text-right" style={{ flexShrink: 0, paddingTop: 2 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', marginBottom: 4 }}>CONF.</div>
                  <div className="font-bold uppercase shimmer-badge" style={{
                    fontSize: 10, color: confColor,
                    fontFamily: 'Space Grotesk, sans-serif',
                    letterSpacing: '0.05em', padding: '0 4px',
                  }}>
                    {confPct}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', marginBottom: 4 }}>VERIFIABLE</div>
                  <div className="font-bold uppercase" style={{
                    fontSize: 10,
                    color: c.verifiable ? '#00F0FF' : '#ffb4ab',
                    fontFamily: 'Space Grotesk, sans-serif',
                    letterSpacing: '0.05em',
                  }}>
                    {c.verifiable ? 'YES' : 'NO'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
