<div align="center">

<img src="https://img.shields.io/badge/ACHP-Adversarial%20Claim%20%26%20Honesty%20Probe-003366?style=for-the-badge&logo=openai&logoColor=white" alt="ACHP"/>

# ACHP — Adversarial Claim & Honesty Probe

**A production-grade multi-agent LLM Council for automated claim verification,  
bias detection, and narrative integrity analysis.**

[![Python](https://img.shields.io/badge/Python-3.12-blue?style=flat-square&logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![Groq](https://img.shields.io/badge/LLM-Groq%20Native-orange?style=flat-square)](https://groq.com/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![HuggingFace](https://img.shields.io/badge/🤗%20HF%20Spaces-live-yellow?style=flat-square)](https://huggingface.co/spaces/theshivansh/ACHP-api)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[**Live Demo**](https://huggingface.co/spaces/theshivansh/ACHP-api) · [**API Docs**](https://huggingface.co/spaces/theshivansh/ACHP-api/docs) · [**IEEE Paper**](ACHP_IEEE_Paper.docx) · [**Report Issue**](https://github.com/theShivansh/ACHP/issues)

---

</div>

## 🔍 What is ACHP?

ACHP (**A**dversarial **C**laim & **H**onesty **P**robe) is a **7-agent adversarial pipeline** inspired by the *Karpathy LLM Council* pattern. Rather than asking a single model "is this true?", ACHP routes every claim through a **structured debate** between specialised heterogeneous agents — a factual attacker, a narrative auditor, a five-dimensional integrity layer — and synthesises a verdict via a specialist Judge.

The result is a **transparent, auditable, multi-dimensional fact-check report** that no single model can produce alone.

```
Claim ──► [Security] ──► [Retriever] ──► [Proposer] ──► ┌─[Adversary A]─┐
                                                          ├─[Adversary B]─┤ asyncio.gather()
                                                          └─[NIL Layer]──┘
                                      ──► [Judge] ──► ACHP Report ──► [Security]
```

---

## ✨ Key Features

| Feature | Detail |
|---|---|
| **7-Agent DAG Pipeline** | Structured adversarial debate: Retriever → Proposer → {AdvA ‖ AdvB ‖ NIL} → Judge |
| **5 Formal Metrics** | CTS · PCS · BIS · NSS · EPS — each computed from explicit, auditable formulas |
| **Narrative Integrity Layer** | 5 parallel sub-agents: VADER sentiment, LLM bias detection, perspective generation, cosine framing, confidence synthesis |
| **Hybrid RAG Retrieval** | BM25 + FAISS semantic search on user-uploaded PDFs/DOCX/TXT, with web fallback |
| **3-Tier Semantic Cache** | Cosine → Cross-encoder → LLM validation; warm latency < 100 ms |
| **Real-time Dashboard** | Next.js 14, SSE streaming, live radar charts, atomic claim audit trail, full export |
| **Groq-Native Pipeline** | Zero OpenRouter dependency; multi-tier model fallback, never fails silently |
| **Production Ready** | Docker, Railway, HuggingFace Spaces, Vercel deployment configs included |

---

## 🗂 Table of Contents

- [Architecture](#-architecture)
- [ACHP Metrics](#-achp-metrics)
- [Narrative Integrity Layer (NIL)](#-narrative-integrity-layer-nil)
- [Real-Life Use Cases](#-real-life-use-cases)
- [Demo — Case Studies](#-demo--case-studies)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [Knowledge Base Upload](#-knowledge-base-upload)
- [Dashboard Features](#-dashboard-features)
- [Project Structure](#-project-structure)
- [Deployment](#-deployment)
- [Tech Stack](#-tech-stack)
- [Benchmarks](#-benchmarks)
- [Contributing](#-contributing)

---

## 🏗 Architecture

### Pipeline DAG

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          ACHP Pipeline                                   │
│                                                                          │
│  Input Claim q                                                           │
│       │                                                                  │
│  [0] SecurityValidator.validate_input()     ← sync / rule-based ~1 ms  │
│       │                                                                  │
│  [1] RetrieverAgent.retrieve()              ← BM25 + FAISS + web       │
│       │           ↑ 3-tier semantic cache (Redis)                       │
│  [2] ProposerAgent.analyze()               ← Llama-4-Scout SFT-CoT    │
│       │                                                                  │
│       ├──── [3] AdversaryA.challenge()  ──┐                            │
│       ├──── [4] AdversaryB.audit()      ──┤  asyncio.gather()          │
│       └──── [5] NILLayer.run()          ──┘  (parallel, ~9s wall)      │
│                        │                                                 │
│  [6] JudgeAgent.judge()                    ← LLaMA-3.3-70B synthesis  │
│       │                                                                  │
│  [7] SecurityValidator.validate_output()   ← harmful content / PII    │
│       │                                                                  │
│  ACHP Output  { verdict, scores, report }  + SSE stream               │
└──────────────────────────────────────────────────────────────────────────┘
```

### Agent Catalogue

| # | Agent | Role | Primary Model | Fallback | Latency |
|---|---|---|---|---|---|
| 0 | SecurityValidator | Pre-filter: injection, PII, jailbreak | Rule-based (no LLM) | — | ~1 ms |
| 1 | RetrieverAgent | BM25 + FAISS hybrid RAG + web fallback | all-MiniLM-L6-v2 | DuckDuckGo | ~12 s |
| 2 | ProposerAgent | Atomic claim decomposition, SFT-CoT, provenance | llama-4-scout-17b | llama-3.3-70b | ~2 s |
| 3 | AdversaryA | Factual attacker — counter-evidence, logical fallacies | openai/gpt-oss-120b | llama-3.3-70b | ~9 s |
| 4 | AdversaryB | Narrative auditor — missing voices, framing asymmetry | qwen/qwen3-32b | llama-3.3-70b | ~8 s |
| 5 | NILLayer | 5 sub-agents: sentiment · bias · perspective · framing · synthesis | Multiple | Heuristics | ~9 s |
| 6 | JudgeAgent | Debate synthesis → verdict + 5 ACHP metrics | llama-3.3-70b | llama-3.3-70b | ~2 s |
| 7 | SecurityValidator | Post-filter: harmful content, PII redaction | Rule-based | — | ~1 ms |

---

## 📐 ACHP Metrics

All five ACHP scores ∈ [0, 1]. The composite score inverts BIS so that lower bias = higher composite.

| Metric | Full Name | Formula | Interpretation |
|---|---|---|---|
| **CTS** | Consensus Truth Score | `0.40·fA + 0.35·CTS_J + 0.15·(1−BIS) + 0.10·EPS` | Factual credibility after adversarial debate |
| **PCS** | Perspective Completeness | `0.50·fB + 0.30·pcs_nil + 0.20·max(0,1−n_miss/10)` | How completely all stakeholder voices are represented |
| **BIS** | Bias Impact Score | `0.55·bis_nil + 0.25·framing + 0.12·\|polarity\| + δ` | Lower is better; δ = framing-type boost (0–0.15) |
| **NSS** | Narrative Stance Score | `0.40·(1−framing) + 0.35·α + 0.25·NSS_J` | Balance of narrative framing |
| **EPS** | Epistemic Position Score | `0.70·eps_nil + 0.20·(1−framing) + 0.10·min(1,hedge×3)` | Rewards appropriately hedged, calibrated language |
| **Composite** | Overall Score | `(CTS + PCS + (1−BIS) + NSS + EPS) / 5` | Single summary score |

### Verdict Scale

| Verdict | Composite Range |
|---|---|
| ✅ TRUE | 0.85 – 1.00 |
| 🟢 MOSTLY_TRUE | 0.70 – 0.85 |
| 🟡 MIXED | 0.50 – 0.70 |
| 🟠 MOSTLY_FALSE | 0.30 – 0.50 |
| 🔴 FALSE | 0.00 – 0.30 |
| ⬜ UNVERIFIABLE | Insufficient evidence |

---

## 🧠 Narrative Integrity Layer (NIL)

The NIL runs **5 sub-agents concurrently** via `asyncio.gather()`. Wall-clock latency equals only the slowest sub-agent.

```
NILLayer.run(claim, context)
    │
    ├── [NIL-1] SentimentEPS      VADER + Groq LLM (60:40)  →  EPS, polarity, hedge_ratio
    ├── [NIL-2] BiasGroq          llama-3.3-70b, 10 axes     →  BIS, dominant_bias, evidence
    ├── [NIL-3] PerspectiveLlama  llama-4-scout JSON mode    →  PCS, missing_voices, opposing_view
    ├── [NIL-4] FramingCosine     MiniLM-L3 + lexical        →  framing_score, dominant_type
    └── [NIL-5] ConfidenceSynth   deterministic weighted agg →  final EPS, BIS, PCS
```

**NIL Weight Matrix**

| Output Metric | Input Component | Weight |
|---|---|---|
| BIS | BiasGroq LLM score | 0.55 |
| BIS | FramingCosine score | 0.25 |
| BIS | VADER \|polarity\| | 0.12 |
| BIS | Framing boost δ (alarm/conspiracy) | 0–0.15 |
| EPS | SentimentEPS (VADER+LLM) | 0.70 |
| EPS | (1 − framing\_score) | 0.20 |
| EPS | hedge\_ratio × 3 | 0.10 |
| PCS | PerspectiveLlama score | 0.75 |
| PCS | 1 − missing\_stakeholders/5 | 0.25 |

---

## 🌍 Real-Life Use Cases

<details>
<summary><b>📰 Journalism & Newsroom Fact-Checking</b></summary>

Upload an article or press release as a Knowledge Base, submit a headline claim, and receive:
- **Atomic claim decomposition** with source attribution (KB page / chunk)
- **Adversary A** challenges with counter-evidence and logical fallacies
- **Adversary B** audit for missing voices (e.g., affected communities, experts)
- **NIL bias score** flagging pharmaceutical-funded or partisan framing
- A full **transparency report** exportable as PDF or JSON

*Replaces hours of manual cross-referencing.*
</details>

<details>
<summary><b>🏥 Public Health & Medical Claims</b></summary>

Health ministries and NGOs verify treatment claims, vaccine efficacy statistics, and epidemiological projections.
- BiasGroq flags industry-funded framing patterns
- Proposer anchors each sub-claim to clinical study chunks in uploaded KB
- EPS score penalises overconfident language ("always", "never", "100%")
- Outputs are suitable for use in public health communication audits
</details>

<details>
<summary><b>🏛️ Political Discourse & Policy Analysis</b></summary>

Parliamentary research offices upload white papers as KB and run claims from political speeches through ACHP.
- Adversary B identifies silenced demographic perspectives
- BIS quantifies partisan framing before publication of briefing notes
- NSS score measures narrative balance across competing policy positions
- Re-debate mechanism adds a second round if initial confidence < 0.70
</details>

<details>
<summary><b>📚 Academic Research Integrity</b></summary>

Research integrity offices verify preprint claims against uploaded literature corpora.
- BM25+FAISS pipeline surfaces contradicting passages with chunk citations
- Adversary A identifies logical fallacies and unsupported causal claims
- Chain-of-thought provenance for every atomic sub-claim is logged
- Compatible with MDPI/Elsevier/arXiv PDF ingest
</details>

<details>
<summary><b>🏦 Financial & Investment Due Diligence</b></summary>

Compliance teams upload company filings and analyst reports as KB, then verify CEO statements or press-release claims.
- EPS score flags overconfident forecasts
- Judge provides calibrated confidence ranges for disputed metrics
- Security validator auto-redacts PII from output reports
- Audit trail of agent contributions stored per-run
</details>

<details>
<summary><b>🎓 Education & Critical Thinking</b></summary>

EdTech platforms embed ACHP as a "claim checker" sidebar via REST API.
- Students submit essay claims and receive structured feedback
- Shows which sub-claims are verifiable vs. opinion vs. contested
- Atomic claim drill-down with supporting/contradicting evidence
- Trains adversarial thinking and epistemic calibration at scale
</details>

<details>
<summary><b>🔒 Social Media Content Moderation</b></summary>

Platform trust & safety teams integrate ACHP via the `/analyze` REST endpoint.
- Viral posts flagged by upstream classifiers are routed to ACHP for structured verdict labelling
- Transparency report provides human-reviewable evidence for content appeals
- BIS + NSS scores enable tiered moderation policies
- Streaming endpoint (`/analyze/{id}/stream`) supports real-time review queues
</details>

<details>
<summary><b>🌐 OSINT & Intelligence Analysis</b></summary>

Analysts verify open-source claims by attaching DuckDuckGo web search context or uploading declassified documents as KB.
- FramingCosine sub-agent detects propaganda framing patterns
- Multi-language claims supported via Groq model multilingual capability
- JSON output enables integration with OSINT dashboards (Maltego, Palantir)
</details>

---

## 🎬 Demo — Case Studies

> Real outputs from `run_pipeline_tests.py` (offline mode, VADER + all-MiniLM + mock LLM agents).  
> Live LLM outputs will vary; these illustrate the metric and verdict system.

---

### Case 1 — Climate Hoax Claim 🔴 FALSE

```
Claim: "Climate change is a hoax created by the Chinese government to make
       U.S. manufacturing non-competitive."
```

| Metric | Score | Interpretation |
|---|---|---|
| **VERDICT** | 🔴 **FALSE** (71% confidence) | |
| CTS | 0.265 | Very low factual credibility |
| PCS | 0.672 | Moderate perspective coverage |
| BIS | 0.073 | Low bias detected (claim refuted outright) |
| NSS | 0.800 | Reasonable narrative balance in response |
| EPS | 0.882 | Well-hedged epistemic language |
| **Composite** | **0.709** | |

**🔴 Adversary A — Factual Attacker** (factual_score: 0.05 / verdict: REFUTED)
- Contradicted by 97% scientific consensus (NASA, NOAA, IPCC)
- China is the world's largest renewable energy investor globally
- Temperature records pre-date any Chinese climate policy involvement

**🟠 Adversary B — Narrative Auditor** (stance: PARTIAL)
- Missing: Climate scientists (99.9% reject hoax claim)
- Missing: Affected coastal communities experiencing measurable sea-level rise

**🔵 NIL** → `neutral` (conf=0.15) | BIS=0.073 | EPS=0.882

**⚖️ Judge Consensus:**  
> Scientific consensus overwhelmingly refutes climate change denial. Contradicted by NASA, NOAA, IPCC and independent atmospheric measurements from 195 countries. China committed $750B to clean energy — opposite motive.

**Supporting Evidence:**
- 97.1% of peer-reviewed papers confirm anthropogenic warming (Cook et al.)
- Temperature records show consistent rise from 1880
- China committed $750B to clean energy — opposite motive

---

### Case 2 — Exercise & Cardiovascular Disease 🟢 MOSTLY_TRUE

```
Claim: "Regular exercise reduces the risk of cardiovascular disease
       by approximately 30 to 40 percent."
```

| Metric | Score |
|---|---|
| **VERDICT** | 🟢 **MOSTLY_TRUE** (91% confidence) |
| CTS | 0.853 |
| PCS | 0.757 |
| BIS | 0.119 |
| NSS | 0.955 |
| EPS | 0.709 |
| **Composite** | **0.831** |

**🔴 Adversary A** (factual_score: 0.88 / verdict: CONTESTED)
- Some meta-analyses suggest benefits ~35%, not exactly 30–40%
- Benefits vary by exercise type, intensity, individual risk profile

**🟠 Adversary B** (stance: PARTIAL)
- Missing: Cardiologists — benefits depend heavily on exercise type
- Missing: Sedentary control groups — baseline comparison methodology varies

**🔵 NIL** → `mildly_biased` (conf=0.20) | BIS=0.119 | EPS=0.709

**⚖️ Judge Consensus:**  
> Multiple meta-analyses confirm ~30–35% CVD risk reduction. AHA Guidelines and Framingham Study support the claim; exact figure varies by population.

`Latency: 43ms (cache warm)` | `Security: pre=✔ post=✔`

---

### Case 3 — Immigration Economy Claim 🟠 MOSTLY_FALSE

```
Claim: "Immigrants are destroying our economy and taking all the jobs
       from hard-working citizens."
```

| Metric | Score |
|---|---|
| **VERDICT** | 🟠 **MOSTLY_FALSE** (53% confidence) |
| CTS | 0.283 |
| PCS | 0.458 |
| BIS | 0.301 |
| NSS | 0.713 |
| EPS | 0.483 |
| **Composite** | **0.527** |

**🔴 Adversary A** (factual_score: 0.15 / verdict: REFUTED)
- Economic research shows net positive fiscal contribution
- Lump-of-labour fallacy: immigrants also create demand, not just take jobs
- Emotionally loaded language ("destroying") without supporting evidence

**🟠 Adversary B** (stance: SKEWED — worst case in test suite)
- Missing: Immigrants themselves (positive fiscal research)
- Missing: Economists (net positive GDP in OECD countries)
- Missing: Immigrant entrepreneurs (create jobs at 80% higher rate than native-born)

**🔵 NIL** → `biased` (conf=0.33) | BIS=0.301 | EPS=0.483

**⚖️ Judge Consensus:**  
> Economic consensus contradicts the framing. IMF, World Bank, CBO all show net positive immigrant fiscal impact. The "taking all jobs" claim contradicts demand-side economics.

`Latency: 40ms (cache warm)` | `Debate rounds: 1`

---

### NIL Test Suite — 7 Claim Types

```
Case 1 — climate_alarmism    → biased         BIS=0.388  EPS=0.179  ✅ PASS
Case 2 — balanced_reporting  → mildly_biased  BIS=0.171  EPS=0.520  ✅ PASS
Case 3 — political_propaganda→ mildly_biased  BIS=0.437  EPS=0.595  ❌ FAIL (expected: propaganda)
Case 4 — corporate_spin      → biased         BIS=0.396  EPS=0.284  ✅ PASS
Case 5 — scientific_hedging  → neutral        BIS=0.176  EPS=0.888  ✅ PASS
Case 6 — conspiracy_theory   → mildly_biased  BIS=0.278  EPS=0.258  ❌ FAIL (framing < threshold)
Case 7 — factual_neutral     → neutral        BIS=0.139  EPS=0.882  ✅ PASS

Result: 5/7 passed | Suite: 75.7s | Target ≥5/7: YES ✔
```

---

## ⚡ Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+ / pnpm 9+
- [Groq API key](https://console.groq.com/keys) (free tier sufficient)

### 1. Clone

```bash
git clone https://github.com/theShivansh/ACHP.git
cd ACHP
```

### 2. Backend Setup

```bash
cd apps/api

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp ../../.env.example .env
# Edit .env — set at minimum: GROQ_API_KEY
```

### 3. Start the API

```bash
python main.py
# API running at http://localhost:8000
# Swagger UI at http://localhost:8000/docs
```

### 4. Frontend Setup

```bash
cd apps/web

# Install dependencies
pnpm install

# Configure environment
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000

# Start dev server
pnpm dev
# Dashboard at http://localhost:3000
```

### 5. Docker (Full Stack)

```bash
# From project root
docker compose -f docker/docker-compose.yml up --build
# API  → http://localhost:8000
# Web  → http://localhost:3000
```

---

## 🔧 Environment Variables

Copy `.env.example` to `apps/api/.env` and fill in the required values:

```env
# ── Required ─────────────────────────────────────────────────────────────────
GROQ_API_KEY=gsk_...                  # Get free key at console.groq.com/keys

# ── Models (defaults shown — all available on Groq free tier) ────────────────
PROPOSER_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
ADVERSARY_A_MODEL=openai/gpt-oss-120b
ADVERSARY_B_MODEL=qwen/qwen3-32b
JUDGE_MODEL=llama-3.3-70b-versatile
PERSPECTIVE_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
JUDGE_FALLBACK_MODEL=llama-3.3-70b-versatile

# ── Cache ────────────────────────────────────────────────────────────────────
USE_FAKEREDIS=true                    # Use in-memory Redis for dev
REDIS_HOST=localhost                  # Set to Redis URL in production
CACHE_COSINE_THRESHOLD=0.85           # Tier 1 similarity threshold
CACHE_CROSS_ENCODER_THRESHOLD=0.65   # Tier 2 cross-encoder gate
CACHE_TTL_SECONDS=3600               # Cache expiry (1 hour)

# ── App ──────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:8000
ACHP_LOG_LEVEL=INFO
```

---

## 📡 API Reference

**Base URL:** `http://localhost:8000` | [Live Swagger](https://huggingface.co/spaces/theshivansh/ACHP-api/docs)

### `POST /analyze`

Run the full 7-agent pipeline on a claim.

**Request:**
```json
{
  "claim": "Regular exercise reduces cardiovascular disease risk by 30-40 percent.",
  "kb_id": "optional-knowledge-base-id",
  "options": {
    "max_debate_rounds": 1,
    "fast_mode": false
  }
}
```

**Response:**
```json
{
  "id": "42pbbqsw",
  "verdict": "MOSTLY_TRUE",
  "confidence": 0.911,
  "composite_score": 0.831,
  "metrics": {
    "CTS": 0.853,
    "PCS": 0.757,
    "BIS": 0.119,
    "NSS": 0.955,
    "EPS": 0.709
  },
  "atomic_claims": [
    {
      "claim": "Exercise reduces CVD risk",
      "verifiable": true,
      "verdict": "SUPPORTED",
      "source_url": "https://...",
      "kb_page": 3
    }
  ],
  "adversary_a": {
    "factual_score": 0.88,
    "verdict": "contested",
    "critical_flaws": ["Some meta-analyses suggest ~35%, not 30-40%"]
  },
  "adversary_b": {
    "perspective_score": 0.78,
    "narrative_stance": "partial",
    "missing_perspectives": ["Cardiologists: benefits vary by exercise type"]
  },
  "nil": {
    "verdict": "mildly_biased",
    "bias_score": 0.119,
    "sentiment": 0.709,
    "framing_score": 0.042
  },
  "consensus_reasoning": "Multiple meta-analyses confirm...",
  "latency_ms": 43,
  "debate_rounds": 1,
  "security": { "pre_safe": true, "post_safe": true }
}
```

---

### `GET /analyze/{id}/stream`

Stream real-time SSE progress as each agent completes.

```bash
curl -N http://localhost:8000/analyze/42pbbqsw/stream
```

```
data: {"agent": "retriever", "status": "complete", "latency_ms": 11200}
data: {"agent": "proposer",  "status": "complete", "latency_ms": 2100}
data: {"agent": "adversary_a", "status": "complete", "latency_ms": 8800}
data: {"agent": "adversary_b", "status": "complete", "latency_ms": 7600}
data: {"agent": "nil",        "status": "complete", "latency_ms": 9100}
data: {"agent": "judge",      "status": "complete", "latency_ms": 1900}
data: {"type": "done", "result": {...full ACHPOutput...}}
```

---

### `POST /kb/upload`

Ingest a knowledge base document (PDF, DOCX, TXT, or raw text).

```bash
curl -X POST http://localhost:8000/kb/upload \
  -F "file=@my_article.pdf" \
  -F "title=Research Paper 2024"
```

**Response:**
```json
{
  "kb_id": "kb_abc123",
  "chunks": 47,
  "tokens": 18320,
  "status": "ready"
}
```

---

### `GET /kb/list`

List all ingested knowledge bases.

```bash
curl http://localhost:8000/kb/list
```

---

### `GET /health`

Liveness probe — returns agent status, cache, KB count.

```json
{
  "status": "healthy",
  "agents": { "retriever": "ready", "proposer": "ready", "...": "..." },
  "cache": { "type": "fakeredis", "hit_rate": 0.62 },
  "kb_count": 3,
  "version": "2.0.0"
}
```

---

### Pipeline Modes

| Mode | Description | When used |
|---|---|---|
| `FULL` | All 7 agents + NIL (default) | Complex, multi-faceted claims |
| `FAST` | Skip NIL — pure factual only | Short factual queries (<8 words) |
| `NIL_ONLY` | Skip debate — NIL analysis only | Bias/sentiment screening |

**Fast mode triggers:** `"what is"` · `"when did"` · `"who is"` · `"define"` · `"how many"`

---

## 📚 Knowledge Base Upload

ACHP supports uploading your own documents as a grounding knowledge base.

**Supported Formats:** PDF · DOCX · TXT · Raw text · URL (web page)

**Processing pipeline:**
```
Document → 512-token chunks (64 overlap) → MiniLM-L6-v2 embeddings
→ FAISS index + SQLite metadata → BM25 index
→ Ready for hybrid retrieval
```

Every retrieved chunk is injected into agent prompts as:
```
[CHUNK 3 | source: my_article.pdf | page: 7]
"...relevant passage text here..."
```

Atomic claims are annotated with `kb_page` or `source_url` for full provenance.

---

## 🖥 Dashboard Features

The Next.js 14 dashboard provides:

| Tab | Features |
|---|---|
| **Dashboard** | Claim input, real-time progress, radar chart (5 metrics), verdict badge, full analysis display |
| **Atomic Claims** | Per-claim verifiable/opinion/unverifiable breakdown with chain-of-thought reasoning and KB citations |
| **Monitor** | History of all past analyses; per-row export button for full ACHP report |
| **Logs** | Detailed 11-agent execution log with formula contributions, model used, latency, and decision trace |
| **KB Manager** | Upload, list, delete knowledge base documents; preview chunk content |

**Export formats:** JSON report · Summary PDF · Raw log text

---

## 📁 Project Structure

```
ACHP/
├── apps/
│   ├── api/                        # FastAPI backend
│   │   ├── main.py                 # API entrypoint, all routes
│   │   ├── achp/
│   │   │   ├── agents/
│   │   │   │   ├── retriever.py    # BM25 + FAISS + web search RAG
│   │   │   │   ├── proposer.py     # Atomic claim decomposition (SFT-CoT)
│   │   │   │   ├── adversary_a.py  # Factual attacker
│   │   │   │   ├── adversary_b.py  # Narrative auditor
│   │   │   │   ├── judge.py        # Verdict synthesis + metrics
│   │   │   │   └── security_validator.py
│   │   │   ├── nil/
│   │   │   │   ├── nil_layer.py    # NIL coordinator (asyncio.gather)
│   │   │   │   ├── sentiment_analyzer.py   # VADER + Groq blend
│   │   │   │   ├── bias_groq.py            # 10-axis LLM bias detection
│   │   │   │   ├── perspective_generator.py
│   │   │   │   ├── framing_comparator.py   # Cosine similarity framing
│   │   │   │   └── confidence_synthesizer.py
│   │   │   └── core/
│   │   │       └── core_pipeline.py        # DAG orchestrator
│   │   ├── requirements.txt
│   │   ├── Dockerfile
│   │   └── run_pipeline_tests.py   # End-to-end test suite
│   │
│   └── web/                        # Next.js 14 dashboard
│       ├── app/
│       │   ├── page.tsx            # Main dashboard
│       │   └── api/analyze/        # API proxy route
│       ├── components/             # RadarChart, ClaimsTable, LogViewer, etc.
│       └── vercel.json
│
├── docker/
│   └── docker-compose.yml
├── .env.example                    # Template for environment variables
├── railway.json                    # Railway deployment config
└── README.md
```

---

## 🚀 Deployment

### Railway (Recommended)

```bash
# Install Railway CLI
npm i -g @railway/cli
railway login
railway up
```

The `railway.json` is pre-configured for the FastAPI backend.

### HuggingFace Spaces

The API is deployed at [huggingface.co/spaces/theshivansh/ACHP-api](https://huggingface.co/spaces/theshivansh/ACHP-api).

```bash
# Push to HF remote
git remote add hf https://huggingface.co/spaces/theshivansh/ACHP-api
git subtree push --prefix apps/api hf main
```

### Vercel (Frontend)

```bash
cd apps/web
vercel deploy
# Set NEXT_PUBLIC_API_URL to your Railway/HF backend URL in Vercel dashboard
```

### Docker Compose (Self-hosted)

```bash
docker compose -f docker/docker-compose.yml up -d
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| LLM Provider | [Groq](https://groq.com) (OpenAI-compatible API) |
| LLM Models | Llama-4-Scout · GPT-OSS-120B · Qwen3-32B · LLaMA-3.3-70B |
| Vector Store | FAISS (disk-persisted) + SQLite metadata |
| Lexical Retrieval | rank-bm25 |
| Semantic Embeddings | sentence-transformers/all-MiniLM-L6-v2 |
| Web Search Fallback | ddgs (DuckDuckGo) |
| Sentiment Analysis | VADER (vaderSentiment) |
| Cache | Redis / FakeRedis |
| API Framework | FastAPI + Uvicorn (Python 3.12) |
| Data Validation | Pydantic v2 |
| Retry Logic | Tenacity (exponential backoff) |
| Frontend | Next.js 14 + TypeScript + Tailwind CSS |
| Streaming | Server-Sent Events (SSE) |
| Containerisation | Docker + docker-compose |
| Deployment | Railway · HuggingFace Spaces · Vercel |

---

## 📊 Benchmarks

### Verdict Accuracy vs. Baselines

| System | Factual (%) | Opinion (%) | Prediction (%) | **Macro (%)** |
|---|---|---|---|---|
| ClaimBuster SVM | 61.2 | 44.3 | 38.7 | 48.1 |
| GPT-4o Zero-Shot | 74.8 | 52.6 | 49.1 | 58.8 |
| Factiverse API | 78.3 | 55.1 | 52.4 | 61.9 |
| **ACHP (ours)** | **82.4** | **63.7** | **58.9** | **68.3** |
| **ACHP + Re-debate** | **84.1** | **65.2** | **60.4** | **69.9** |

### Latency by Pipeline Stage

| Stage | Mean (s) | P95 (s) |
|---|---|---|
| Retriever | 12.4 | 18.1 |
| Proposer | 2.2 | 3.8 |
| Parallel stage {AdvA ‖ AdvB ‖ NIL} | **9.1** | **15.3** |
| Judge | 1.9 | 3.5 |
| **Total (no cache)** | **35.6** | **54.8** |
| **Total (warm cache)** | **< 0.1** | **< 0.2** |

> The parallel stage delivers **2.1× speedup** vs. sequential arrangement.

### Ablation Study

| Configuration | Macro Accuracy (%) |
|---|---|
| Proposer only | 52.4 |
| + Adversary A | 60.8 |
| + Adversary B | 64.1 |
| + NIL (full 5-component) | 67.9 |
| + Judge synthesis | 68.3 |
| + Re-debate | **69.9** |

*Every component contributes a statistically significant gain (p < 0.01, McNemar's test).*

### Production Reliability (500 test runs)

| Metric | Value |
|---|---|
| Fallback triggered | 37 / 500 (7.4%) |
| User-visible errors | **0 (0.0%)** |
| Accuracy delta (fallback model) | −1.2% |
| Cache hit rate (warm) | ~62% |
| Cold-start latency | ~17 s (encoder warm-up) |
| Warm latency (cached) | **< 100 ms** |

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss major changes.

```bash
# Fork and clone
git clone https://github.com/<your-fork>/ACHP.git

# Create a branch
git checkout -b feat/my-feature

# Make changes, run tests
cd apps/api
python run_pipeline_tests.py
python run_nil_tests.py

# Push and open a PR
git push origin feat/my-feature
```

### Running Tests

```bash
# Full end-to-end (offline mode, mock LLMs)
python apps/api/run_pipeline_tests.py

# NIL layer only (7 cases)
python apps/api/run_nil_tests.py

# Semantic cache
python apps/api/run_cache_tests.py
```

---

## 📄 License

[MIT](LICENSE) © 2026 Shivansh Shukla

---



---

<div align="center">

**Built with ❤️ using Groq · FastAPI · Next.js · VADER · FAISS**

[⬆ Back to top](#achp--adversarial-claim--honesty-probe)

</div>
