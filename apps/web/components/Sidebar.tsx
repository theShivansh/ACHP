'use client';
import { useState } from 'react';

const AGENTS = [
  {
    key: 'retriever',
    label: 'Retriever',
    icon: 'database',
    model: 'all-MiniLM-L6-v2 + FakeRedis',
    role: 'Semantic RAG + cache lookup',
    desc: 'Performs semantic search over the knowledge base using sentence-transformers. Returns the top-k relevant passages with cosine similarity scores, and checks the semantic cache (Redis) for near-duplicate query results.',
    outputs: ['Retrieved passages', 'Cache hit/miss', 'Confidence scores'],
    color: '#00F0FF',
  },
  {
    key: 'proposer',
    label: 'Proposer',
    icon: 'psychology',
    model: 'Groq / Llama 4 Scout',
    role: 'Atomic claim extraction + citations',
    desc: 'Decomposes the input query into atomic, verifiable sub-claims. Each claim is tagged with an epistemic marker (claims, suggests, establishes), a verifiability flag, and a confidence score.',
    outputs: ['Atomic claims list', 'Epistemic markers', 'Citation hints'],
    color: '#00F0FF',
  },
  {
    key: 'adversary_a',
    label: 'Adversary A',
    icon: 'security',
    model: 'OpenRouter / DeepSeek R1',
    role: 'Factual challenger',
    desc: 'Rigorously challenges each atomic claim for factual accuracy. Searches for contradicking scientific literature, statistical misrepresentations, and logical fallacies. Outputs a factual score and list of critical flaws.',
    outputs: ['Factual score 0–1', 'Critical flaws', 'Verdict: refuted/contested/supported'],
    color: '#00F0FF',
  },
  {
    key: 'adversary_b',
    label: 'Adversary B',
    icon: 'gavel',
    model: 'Groq / Llama 3.3 70B',
    role: 'Narrative auditor',
    desc: 'Evaluates the narrative framing, perspective balance, and rhetorical stance of the claim. Identifies missing stakeholder viewpoints and scores the claim\'s epistemic posture.',
    outputs: ['Perspective score', 'Narrative stance', 'Missing perspectives'],
    color: '#A100F0',
  },
  {
    key: 'sentiment',
    label: 'Sentiment',
    icon: 'sentiment_very_satisfied',
    model: 'VADER + Groq Scout',
    role: 'EPS — Epistemic position score',
    desc: 'Classifies the emotional and epistemic tone of the claim text. Combines VADER lexical scoring with LLM-based epistemic position analysis to produce the EPS (Epistemic Position Score).',
    outputs: ['Sentiment polarity', 'EPS score', 'Hedging detected'],
    color: '#e5b5ff',
  },
  {
    key: 'bias',
    label: 'Bias',
    icon: 'visibility_off',
    model: 'all-MiniLM-L6-v2 + Groq',
    role: 'BIS — Bias impact classifier',
    desc: 'Detects ideological, political, or cognitive biases embedded in the claim framing. Identifies strawman arguments, loaded language, and false dichotomies. Outputs the BIS (Bias Impact Score).',
    outputs: ['BIS score 0–1', 'Bias categories', 'Loaded terms'],
    color: '#e5b5ff',
  },
  {
    key: 'perspective',
    label: 'Perspective',
    icon: 'switch_access_shortcut',
    model: 'Groq / Mixtral 8x7B',
    role: 'PCS — Perspective completeness',
    desc: 'Generates concrete opposing and neutral reformulations of the claim to test perspective completeness. Evaluates whether the original framing fairly represents the solution space.',
    outputs: ['PCS score', 'Reformulated claims', 'Opposing views'],
    color: '#e5b5ff',
  },
  {
    key: 'framing',
    label: 'Framing',
    icon: 'grid_view',
    model: 'all-MiniLM-L6-v2 cosine',
    role: 'NSS — Narrative stance scorer',
    desc: 'Computes cosine similarity between the claim embedding and a balanced-framing reference corpus. Lower similarity = more extreme narrative stance. Outputs the NSS (Narrative Stance Score).',
    outputs: ['NSS score 0–1', 'Cosine similarities', 'Reference framing gap'],
    color: '#e5b5ff',
  },
  {
    key: 'nil_supervisor',
    label: 'NIL Layer',
    icon: 'auto_awesome',
    model: 'Groq + 5-agent parallel',
    role: 'Narrative Integrity supervisor',
    desc: 'Orchestrates 5 parallel sub-agents (Sentiment, Bias, Perspective, Framing, Confidence) and synthesizes their outputs into a unified Narrative Integrity verdict with confidence interval.',
    outputs: ['NIL verdict', 'Confidence', 'Composite BIS/EPS/PCS/NSS'],
    color: '#FED639',
  },
  {
    key: 'judge',
    label: 'Judge',
    icon: 'balance',
    model: 'Groq / Llama 3.3 70B',
    role: 'LLM council consensus + CTS score',
    desc: 'Acts as the final arbitration layer. Receives all agent outputs, conducts structured multi-round debate (max 3 rounds), and produces the final verdict with consensus reasoning and the CTS (Consensus Truth Score).',
    outputs: ['Final verdict', 'CTS score', 'Consensus reasoning', 'Caveats'],
    color: '#00F0FF',
  },
  {
    key: 'orchestrator',
    label: 'Orchestrator',
    icon: 'memory',
    model: 'Internal / planning mode',
    role: 'Master pipeline coordinator',
    desc: 'The master controller. Implements dynamic model routing, conditional branching (skip proposer if cache hit), and manages parallel NIL execution. Also handles retry logic with tenacity.',
    outputs: ['Pipeline mode', 'Routing decisions', 'Total latency'],
    color: '#00F0FF',
  },
];

interface SidebarProps {
  activeAgents: Set<string>;
  doneAgents:   Set<string>;
  isRunning:    boolean;
  onRun:        () => void;
  resultCount:  number;
  onInitRun?:   (query?: string) => void;
}

function AgentDetailPanel({
  agent,
  isActive,
  isDone,
  onClose,
}: {
  agent: typeof AGENTS[0];
  isActive: boolean;
  isDone: boolean;
  onClose: () => void;
}) {
  const statusColor = isActive ? '#00F0FF' : isDone ? 'rgba(0,240,255,0.60)' : 'rgba(255,255,255,0.20)';
  const statusLabel = isActive ? 'ACTIVE' : isDone ? 'DONE' : 'IDLE';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-start"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />

      {/* Panel */}
      <div
        className="relative"
        style={{
          marginTop: 64,
          marginLeft: 240,
          width: 340,
          background: '#111',
          border: `1px solid ${agent.color}30`,
          borderLeft: `3px solid ${agent.color}`,
          boxShadow: `0 0 40px ${agent.color}15, 0 24px 48px rgba(0,0,0,0.60)`,
          maxHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
          zIndex: 10,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: `${agent.color}08`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: agent.color }}>
                {agent.icon}
              </span>
              <span
                className="font-bold uppercase"
                style={{ fontSize: 13, letterSpacing: '0.05em', color: '#e5e2e1', fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {agent.label}
              </span>
            </div>
            <button
              onClick={onClose}
              className="material-symbols-outlined"
              style={{ fontSize: 18, color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              close
            </button>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2 mt-2">
            <span
              className="rounded-full"
              style={{
                width: 6, height: 6,
                background: statusColor,
                boxShadow: isActive ? `0 0 6px ${statusColor}` : 'none',
                flexShrink: 0,
                display: 'inline-block',
              }}
            />
            <span
              className="uppercase font-bold"
              style={{ fontSize: 9, letterSpacing: '0.15em', color: statusColor, fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {statusLabel}
            </span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)', marginLeft: 8, fontFamily: 'JetBrains Mono, monospace' }}>
              {agent.model}
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '14px 16px' }}>
          {/* Role */}
          <p
            className="uppercase font-bold"
            style={{ fontSize: 9, letterSpacing: '0.12em', color: agent.color, fontFamily: 'Space Grotesk, sans-serif', marginBottom: 6 }}
          >
            {agent.role}
          </p>

          {/* Description */}
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, marginBottom: 14 }}>
            {agent.desc}
          </p>

          {/* Outputs */}
          <div>
            <p
              className="uppercase font-bold"
              style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', fontFamily: 'Space Grotesk, sans-serif', marginBottom: 8 }}
            >
              Outputs
            </p>
            {agent.outputs.map((o, i) => (
              <div
                key={i}
                className="flex items-center gap-2"
                style={{ marginBottom: 6 }}
              >
                <span style={{ width: 4, height: 4, background: agent.color, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {o}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({
  activeAgents,
  doneAgents,
  isRunning,
  onRun,
  resultCount,
  onInitRun,
}: SidebarProps) {
  const [selectedAgent, setSelectedAgent] = useState<typeof AGENTS[0] | null>(null);

  return (
    <>
      <aside
        className="hidden md:flex flex-col h-full"
        style={{
          width: 240,
          background: 'rgba(14,14,14,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          flexShrink: 0,
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 14 }}>
            <div
              className="flex items-center justify-center"
              style={{
                width: 36, height: 36,
                background: 'rgba(161,0,240,0.10)',
                border: '1px solid rgba(161,0,240,0.30)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#e5b5ff' }}>memory</span>
            </div>
            <div>
              <h2
                className="font-bold uppercase"
                style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, letterSpacing: '0.15em', color: '#00F0FF' }}
              >
                Agent Manager
              </h2>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', marginTop: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                CORE PIPELINE v4.2
              </p>
            </div>
          </div>

        </div>

        {/* Agent list */}
        <nav className="flex flex-col py-2 flex-1 overflow-y-auto custom-scrollbar">
          <p
            className="uppercase"
            style={{
              fontSize: 8, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.15)',
              fontFamily: 'Space Grotesk, sans-serif', padding: '4px 16px 8px',
            }}
          >
            Click agent for details ↓
          </p>
          {AGENTS.map(a => {
            const isActive = activeAgents.has(a.key);
            const isDone   = doneAgents.has(a.key);
            const statusColor = isActive ? '#00F0FF' : isDone ? 'rgba(0,240,255,0.50)' : 'rgba(255,255,255,0.08)';

            return (
              <button
                key={a.key}
                onClick={() => setSelectedAgent(a)}
                className="flex items-center gap-3 text-left w-full"
                style={{
                  padding: '9px 16px',
                  background: isActive ? 'rgba(0,240,255,0.06)' : 'transparent',
                  borderStyle: 'solid',
                  borderTopWidth: 0,
                  borderBottomWidth: 0,
                  borderLeftWidth: 0,
                  borderRightWidth: 3,
                  borderRightColor: isActive ? '#00F0FF' : isDone ? 'rgba(0,240,255,0.25)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                    (e.currentTarget as HTMLElement).style.borderRightColor = `${a.color}40`;
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.borderRightColor = isDone ? 'rgba(0,240,255,0.25)' : 'transparent';
                  }
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 16,
                    color: isActive ? '#00F0FF' : isDone ? 'rgba(0,240,255,0.50)' : 'rgba(255,255,255,0.20)',
                    flexShrink: 0,
                  }}
                >
                  {a.icon}
                </span>
                <span
                  className="flex-1 uppercase text-left"
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    color: isActive ? '#00F0FF' : isDone ? 'rgba(255,255,255,0.50)' : 'rgba(255,255,255,0.25)',
                  }}
                >
                  {a.label}
                </span>
                {/* Status dot */}
                <span
                  className="rounded-full flex-shrink-0"
                  style={{
                    width: 5, height: 5,
                    background: statusColor,
                    boxShadow: isActive ? `0 0 5px ${statusColor}` : 'none',
                    transition: 'all 0.3s',
                    display: 'inline-block',
                  }}
                />
                {/* Click indicator */}
                <span
                  className="material-symbols-outlined opacity-0 group-hover:opacity-100"
                  style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)', marginLeft: -2 }}
                >
                  chevron_right
                </span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.30)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Space Grotesk, sans-serif' }}>
              Pipeline Health
            </span>
            <span style={{ fontSize: 9, color: isRunning ? '#A100F0' : '#00F0FF', fontFamily: 'JetBrains Mono, monospace' }}>
              {isRunning ? 'ACTIVE' : 'READY'}
            </span>
          </div>
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', marginBottom: 10 }}>
            <div
              style={{
                height: '100%',
                width: isRunning ? '60%' : '100%',
                background: isRunning ? 'linear-gradient(90deg, #A100F0, #00F0FF)' : '#00F0FF',
                transition: 'width 0.5s',
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase', fontFamily: 'Space Grotesk, sans-serif' }}>Analyses</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: resultCount > 0 ? '#00F0FF' : 'rgba(255,255,255,0.30)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {resultCount}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase', fontFamily: 'Space Grotesk, sans-serif' }}>Agents</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.40)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {AGENTS.length}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Agent detail panel modal */}
      {selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          isActive={activeAgents.has(selectedAgent.key)}
          isDone={doneAgents.has(selectedAgent.key)}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </>
  );
}
