'use client';
import { useState } from 'react';
import type { QAResponse } from '@/lib/types';

interface RAGAnswerProps {
  result: QAResponse;
  onNewQuery: (q: string) => void;
}

/** Parses "[N]" or "[CHUNK N]" markers → styled clickable citation chips */
function AnnotatedAnswer({ text }: { text: string }) {
  // Split on [CHUNK N] OR [N] — LLMs use both styles
  const parts = text.split(/(\[(?:CHUNK\s*)?\d+\])/gi);

  return (
    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.75, margin: 0 }}>
      {parts.map((part, i) => {
        const match = part.match(/^\[(?:CHUNK\s*)?(\d+)\]$/i);
        if (match) {
          const n = match[1];
          return (
            <a
              key={i}
              href={`#cite-${n}`}
              onClick={e => {
                e.preventDefault();
                document.getElementById(`cite-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }}
              title={`View source chunk ${n}`}
              style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
                color: '#e5b5ff', textDecoration: 'none',
                background: 'rgba(161,0,240,0.12)',
                border: '1px solid rgba(161,0,240,0.30)',
                padding: '1px 5px', borderRadius: 3,
                margin: '0 2px', verticalAlign: 'middle',
                transition: 'background 0.15s', cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(161,0,240,0.22)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(161,0,240,0.12)'}
            >
              {n}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

export default function RAGAnswer({ result, onNewQuery }: RAGAnswerProps) {
  // Count citations from API array
  const apiCitationCount = result.citations.length;

  // Also detect inline [N] or [CHUNK N] chips the LLM embedded in the answer
  const inlineMatches = result.answer.match(/\[(?:CHUNK\s*)?(\d+)\]/gi) ?? [];
  const inlineCitedIndices = new Set(
    inlineMatches.map(m => parseInt(m.replace(/\D/g, ''), 10))
  );
  const inlineCitationCount = inlineCitedIndices.size;

  // True if ANY citation evidence exists (API array OR inline chips)
  const hasCitations = apiCitationCount > 0 || inlineCitationCount > 0;
  // Display count: prefer API count (has excerpts), fall back to inline count
  const displayCount = apiCitationCount > 0 ? apiCitationCount : inlineCitationCount;

  return (
    <div className="unit-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#e5b5ff' }}>auto_stories</span>
          <div>
            <div style={{
              fontSize: 10, fontFamily: 'Space Grotesk, sans-serif',
              color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.18em',
            }}>
              Grounded Answer
            </div>
            <div style={{ fontSize: 12, color: '#e5b5ff', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
              {result.kb_name.slice(0, 40)}{result.kb_name.length > 40 ? '…' : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {hasCitations && (
            <span style={{
              fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#e5b5ff',
              background: 'rgba(161,0,240,0.10)', border: '1px solid rgba(161,0,240,0.22)',
              padding: '3px 8px', borderRadius: 4,
            }}>
              {displayCount} source{displayCount !== 1 ? 's' : ''} cited
            </span>
          )}
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.20)' }}>
            {result.latency_ms < 1000 ? `${Math.round(result.latency_ms)}ms` : `${(result.latency_ms / 1000).toFixed(1)}s`}
          </span>
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.14)' }}>
            {result.run_id}
          </span>
        </div>
      </div>

      {/* ── Question ────────────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(161,0,240,0.06)', border: '1px solid rgba(161,0,240,0.14)',
        padding: '12px 16px', borderRadius: 4,
      }}>
        <div style={{
          fontSize: 9, fontFamily: 'Space Grotesk, sans-serif',
          color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase',
          letterSpacing: '0.14em', marginBottom: 6,
        }}>
          Question
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
          "{result.question}"
        </p>
      </div>

      {/* ── Answer ──────────────────────────────────────────────────────── */}
      <div style={{
        background: '#201f1f', border: '1px solid rgba(255,255,255,0.06)',
        padding: '20px 24px', borderRadius: 2,
      }}>
        <div style={{
          fontSize: 9, fontFamily: 'Space Grotesk, sans-serif',
          color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase',
          letterSpacing: '0.14em', marginBottom: 12,
        }}>
          Answer
          {!hasCitations && (
            <span style={{ marginLeft: 8, fontSize: 9, color: 'rgba(255,180,171,0.60)', fontStyle: 'normal' }}>
              · No KB sources were cited — answer may use context only
            </span>
          )}
          {hasCitations && apiCitationCount === 0 && inlineCitationCount > 0 && (
            <span style={{ marginLeft: 8, fontSize: 9, color: 'rgba(100,220,180,0.60)', fontStyle: 'normal' }}>
              · {inlineCitationCount} inline source{inlineCitationCount !== 1 ? 's' : ''} cited ↑
            </span>
          )}
        </div>
        <AnnotatedAnswer text={result.answer} />
      </div>

      {/* ── Citations ───────────────────────────────────────────────────── */}
      {hasCitations && (
        <div>
          <div style={{
            fontSize: 9, fontFamily: 'Space Grotesk, sans-serif',
            color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase',
            letterSpacing: '0.14em', marginBottom: 10,
          }}>
            Source Chunks Used
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,0.04)' }}>
            {result.citations.map(c => (
              <div
                key={c.chunk_index}
                id={`cite-${c.chunk_index}`}
                style={{
                  padding: '14px 16px', background: '#201f1f',
                  display: 'grid', gridTemplateColumns: '36px 1fr auto',
                  gap: '0 14px', alignItems: 'start',
                  scrollMarginTop: 16, transition: 'background 0.15s',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#2a2a2a')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#201f1f')}
              >
                <div style={{
                  width: 36, height: 36, flexShrink: 0,
                  background: 'rgba(161,0,240,0.10)', border: '1px solid rgba(161,0,240,0.22)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                  color: '#e5b5ff', fontWeight: 700,
                }}>
                  {c.chunk_index}
                </div>
                <div>
                  <div style={{
                    fontSize: 9, fontFamily: 'Space Grotesk, sans-serif',
                    color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
                    letterSpacing: '0.10em', marginBottom: 5,
                  }}>
                    Chunk {c.chunk_index}
                    {c.score > 0 && (
                      <span style={{ marginLeft: 8, color: 'rgba(229,181,255,0.45)' }}>
                        · {(c.score * 100).toFixed(0)}% match
                      </span>
                    )}
                  </div>
                  <p style={{
                    fontSize: 12, color: 'rgba(255,255,255,0.55)',
                    lineHeight: 1.55, margin: 0, fontFamily: 'JetBrains Mono, monospace',
                  }}>
                    {c.excerpt.slice(0, 320)}{c.excerpt.length > 320 ? '…' : ''}
                  </p>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(161,0,240,0.40)', paddingTop: 2 }}>
                  database
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ask again strip ──────────────────────────────────────────────── */}
      <div style={{ marginTop: 8, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <AskAgainInput onSubmit={onNewQuery} kbName={result.kb_name} />
      </div>
    </div>
  );
}

// ── Compact ask-again input ────────────────────────────────────────────────────
function AskAgainInput({ onSubmit, kbName }: { onSubmit: (q: string) => void; kbName: string }) {
  const [val, setVal] = useState('');
  const submit = () => { if (val.trim()) { onSubmit(val.trim()); setVal(''); } };

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <span style={{
        fontSize: 9, color: 'rgba(255,255,255,0.25)',
        fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        ASK AGAIN →
      </span>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder={`Ask another question about "${kbName.slice(0, 30)}…"`}
        style={{
          flex: 1, background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '9px 14px', fontSize: 12,
          color: 'rgba(255,255,255,0.75)', outline: 'none',
          fontFamily: 'JetBrains Mono, monospace', borderRadius: 2,
          transition: 'border-color 0.2s',
        }}
        onFocus={e => (e.target.style.borderColor = 'rgba(161,0,240,0.45)')}
        onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
      />
      <button
        onClick={submit}
        disabled={!val.trim()}
        style={{
          padding: '9px 18px',
          fontSize: 10, fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', cursor: val.trim() ? 'pointer' : 'default',
          background: val.trim() ? 'rgba(161,0,240,0.18)' : 'rgba(255,255,255,0.03)',
          color: val.trim() ? '#e5b5ff' : 'rgba(255,255,255,0.20)',
          border: `1px solid ${val.trim() ? 'rgba(161,0,240,0.40)' : 'rgba(255,255,255,0.06)'}`,
          transition: 'all 0.2s', borderRadius: 2,
        }}
      >
        Ask
      </button>
    </div>
  );
}
