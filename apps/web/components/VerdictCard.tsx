'use client';
import { useState } from 'react';
import type { ACHPOutput } from '@/lib/types';
import { downloadFullReport } from '@/lib/exportReport';

const VERDICT_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  TRUE:         { color: '#00F0FF', icon: 'verified',     label: 'True'         },
  MOSTLY_TRUE:  { color: '#7df4ff', icon: 'check_circle', label: 'Mostly True'  },
  MIXED:        { color: '#FED639', icon: 'help',         label: 'Mixed'        },
  MOSTLY_FALSE: { color: '#e5b5ff', icon: 'warning',      label: 'Mostly False' },
  FALSE:        { color: '#ffb4ab', icon: 'cancel',       label: 'False'        },
  BLOCKED:      { color: '#ff6b6b', icon: 'block',        label: 'Blocked'      },
};

function pct(n: number) { return `${Math.round(n * 100)}%`; }

interface VerdictCardProps { result: ACHPOutput; }

export default function VerdictCard({ result }: VerdictCardProps) {
  const [copied, setCopied] = useState(false);

  const verdict = result.verdict ?? 'MIXED';
  const cfg     = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.MIXED;
  const conf    = result.verdict_confidence ?? result.composite_score ?? 0;

  // ── Export: full detailed report ─────────────────────────────────────────
  const handleDownload = () => downloadFullReport(result);

  // ── Export: JSON ──────────────────────────────────────────────────────────
  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section
      className="glass-panel relative overflow-hidden"
      style={{ padding: '28px', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Top row: VERIFIED ANSWER label + export actions */}
      <div className="flex items-start justify-between" style={{ marginBottom: 20 }}>
        {/* Label */}
        <div className="flex items-center gap-2">
          <div style={{ width: 2, height: 16, background: '#00F0FF' }} />
          <span
            className="font-bold uppercase"
            style={{
              fontSize: 10,
              letterSpacing: '0.2em',
              color: '#00F0FF',
              fontFamily: 'Space Grotesk, sans-serif',
            }}
          >
            Verified Answer
          </span>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleDownload}
            className="btn-tactile flex items-center gap-1.5 px-3 py-1.5 transition-all"
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontFamily: 'Space Grotesk, sans-serif',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.50)',
              cursor: 'pointer',
            }}
            title="Download report as text file"
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = '#00F0FF';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.30)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.05)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.50)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>download</span>
            Report
          </button>

          <button
            onClick={handleCopyJSON}
            className="btn-tactile flex items-center gap-1.5 px-3 py-1.5 transition-all"
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontFamily: 'Space Grotesk, sans-serif',
              background: copied ? 'rgba(0,240,255,0.10)' : 'rgba(255,255,255,0.04)',
              border: copied ? '1px solid rgba(0,240,255,0.40)' : '1px solid rgba(255,255,255,0.08)',
              color: copied ? '#00F0FF' : 'rgba(255,255,255,0.50)',
              cursor: 'pointer',
            }}
            title="Copy full JSON result to clipboard"
            onMouseEnter={e => {
              if (!copied) {
                (e.currentTarget as HTMLElement).style.color = '#e5b5ff';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(229,181,255,0.30)';
                (e.currentTarget as HTMLElement).style.background = 'rgba(229,181,255,0.05)';
              }
            }}
            onMouseLeave={e => {
              if (!copied) {
                (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.50)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
              }
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copied!' : 'JSON'}
          </button>
        </div>
      </div>

      {/* Verdict + confidence */}
      <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 24, color: cfg.color, fontVariationSettings: "'FILL' 1" }}>
          {cfg.icon}
        </span>
        <span
          className="font-bold uppercase"
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: 22,
            letterSpacing: '0.03em',
            color: cfg.color,
          }}
        >
          {cfg.label}
        </span>

        {/* Confidence bar */}
        <div className="flex items-center gap-2 flex-1">
          <div className="flex-1" style={{ height: 2, background: 'rgba(255,255,255,0.06)' }}>
            <div
              style={{
                height: '100%',
                width: pct(conf),
                background: cfg.color,
                transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', fontFamily: 'JetBrains Mono, monospace' }}>
            {pct(conf)}
          </span>
        </div>
      </div>

      {/* Query text */}
      <h2
        style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: 18,
          fontWeight: 600,
          lineHeight: 1.4,
          color: 'rgba(255,255,255,0.88)',
          marginBottom: 12,
          maxWidth: '85%',
        }}
      >
        {result.input}
      </h2>

      {/* Reasoning */}
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)', lineHeight: 1.7, maxWidth: '85%' }}>
        {result.consensus_reasoning}
      </p>

      {/* Meta row */}
      <div className="flex items-center flex-wrap gap-4" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        {result.pipeline?.total_ms !== undefined && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono, monospace' }}>
            ⏱ {result.pipeline.total_ms}ms
          </span>
        )}
        {result.debate_rounds !== undefined && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono, monospace' }}>
            ↺ {result.debate_rounds} debate round{result.debate_rounds !== 1 ? 's' : ''}
          </span>
        )}
        {result.pipeline?.cache_hit && (
          <span style={{ fontSize: 10, color: '#FED639', fontFamily: 'JetBrains Mono, monospace' }}>
            ⚡ Cache hit
          </span>
        )}
        {result.security && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono, monospace' }}>
            🔒 Pre:{result.security.pre_safe ? '✓' : '✗'} Post:{result.security.post_safe ? '✓' : '✗'}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', fontFamily: 'JetBrains Mono, monospace' }}>
          ID: {result.run_id}
        </span>
      </div>

      {/* Caveats */}
      {result.caveats && result.caveats.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(254,214,57,0.04)', border: '1px solid rgba(254,214,57,0.10)' }}>
          {result.caveats.map((c, i) => (
            <p key={i} style={{ fontSize: 11, color: 'rgba(254,214,57,0.60)', lineHeight: 1.5, marginBottom: i < result.caveats.length - 1 ? 4 : 0 }}>
              ⚠ {c}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
