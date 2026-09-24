# 10 — Ideation: scored upgrade ideas + launch Reel

## 1. Idea filter (stepwise: relevance → virality/signal → feasibility)

Scores are 1–5. **Total = Relevance×2 + Signal×2 + Feasibility + (6 − Risk)**, max 30. ✅ = included in this kit's phases, 🔜 = next.

| # | Idea | Relevance to persona | Hiring / share signal | Feasibility (2 wks) | Risk | **Total** | Status |
|---|---|---|---|---|---|---|---|
| 1 | **Live investigation board**: agents work in plain sight (no loader) | 5 | 5 | 4 | 2 | **28** | ✅ P3 |
| 2 | **Event log v2 + Trace + replay** (honest, resumable) | 5 | 5 | 4 | 2 | **28** | ✅ P2 |
| 3 | **Case permalink + OG stamp image + WhatsApp summary** | 5 | 5 | 5 | 1 | **30** | ✅ P4/P9 |
| 4 | **Red/blue pencil marks on exact spans** | 5 | 4 | 3 | 3 | **24** | ✅ P3/P8 |
| 5 | **Scroll-story replay with 2 friction gates** | 3 | 5 | 3 | 3 | **22** | ✅ P6 |
| 6 | **MCP App verdict card** (interactive UI inside Claude and other MCP hosts, 2026-07-28 spec) | 3 | 5 | 3 | 3 | **22** | 🔜 after v2 FR4 |
| 7 | Screenshot intake with editable OCR (low-confidence words dotted) | 5 | 4 | 2 | 3 | **23** | 🔜 flag (IF-14) |
| 8 | "Where the agents argued" view: disagreement shown as a conversation of public notes | 4 | 4 | 3 | 2 | **23** | 🔜 P4 stretch |
| 9 | Evidence aging: older sources visibly "yellow" like old paper, with the freshness label | 4 | 3 | 5 | 1 | **24** | ✅ P4 (freshness) |
| 10 | Editor's desk (human review lane) | 3 | 4 | 3 | 2 | **21** | 🔜 flag (IF-20) |
| 11 | Publish the marks and glyphs as a shadcn GitHub registry `theShivansh/achp-ui` | 2 | 4 | 4 | 1 | **21** | 🔜 post-launch |
| 12 | ⌘K command menu | 2 | 2 | 5 | 1 | **18** | ✅ P9 |
| 13 | Compare two runs side by side (ACHP X `compare_runs`) | 2 | 3 | 3 | 2 | **17** | 🔜 |
| 14 | Hindi/Hinglish summary toggle for WhatsApp sharing | 4 | 4 | 3 | 3 | **22** | 🔜 (v2 non-goal: only if trivial via the LLM) |
| 15 | UI sounds or an ambient "newsroom" soundscape | 1 | 1 | 4 | 4 | **10** | ❌ removed: ACHP is silent |
| 16 | 3D desk scene (WebGL) | 1 | 2 | 1 | 5 | **8** | ❌ performance and gimmick risk |
| 17 | **Two-Key Verdict** (Judge × published formula; surfaces the disagreement already visible in paper Fig. 9) | 5 | 5 | 5 | 1 | **30** | ✅ P5 |
| 18 | **Truth-first rule + masking notice + Quiet Falsehood Index** (calm wording can't launder refuted facts) | 5 | 5 | 4 | 2 | **28** | ✅ P5 |
| 19 | **Integrity Ledger** (exact Shapley, double-entry: every point of the score accounted for) | 4 | 5 | 4 | 2 | **26** | ✅ P5 |
| 20 | **Tipping Point** (the smallest single-signal change that flips the verdict) | 4 | 5 | 4 | 2 | **26** | ✅ P5 |
| 21 | **Assay Hallmark** replacing the radar (shapes + fill, full forms, printable in the OG image) | 5 | 4 | 4 | 1 | **27** | ✅ P5 |
| 22 | **Integrity Map** (facts × tone quadrants over all runs) | 3 | 4 | 4 | 1 | **23** | ✅ P9 |
| 23 | **Leverage Lint** in CI (the metric framework can't silently get worse) | 2 | 5 | 5 | 1 | **24** | ✅ P5 |
| 24 | Publish QFI + Two-Key as new metrics in the paper's next revision, validated per 11 §5 | 3 | 5 | 3 | 3 | **22** | 🔜 research |
| 25 | Factual-gate ADR: C_gated = min(C, CTS + 0.15) (fixes masking in the formula itself) | 4 | 4 | 3 | 3 | **22** | 🔜 needs benchmark |

**Top 3 to talk about in interviews:** #18 + #17 ("I audited my own scoring formula, found that calm wording could lift refuted claims to MIXED, and built the UI so it can't hide that"), #2 (a resumable, replayable event log: real distributed-systems thinking), and #1 (latency as product).

## 2. Interview hooks from this upgrade

- **"Why not just a loading spinner?"** → "The pipeline takes 20–60s on free-tier infrastructure. I turned that latency into the best part of the demo: every second shows a real, verifiable step. It's the same event log that powers the trace, the replay and resumable streams."
- **"How do you avoid showing chain-of-thought?"** → "Agents emit a validated `public_note` field (≤140 characters, no process talk, only cited evidence). Deterministic templates are the fallback. Users see actions, evidence and outputs, never reasoning tokens."
- **"Your paper says the composite is auditable. Is it?"** → "I computed its sensitivities. Framing moves it about 3× more than the factual attack, so a refuted claim written calmly can score MIXED, like my own Case 1. The Assay tab now shows a Shapley ledger of every point, a two-key check against the Judge, and a masking notice, and CI fails if the formula leans further on tone."
- **"How do you know the UI isn't lying?"** → "The UI is a pure reducer over an append-only event log. CI greps for hard-coded model names and synthetic progress, and a Playwright test asserts the page is still once the run completes."

## 3. Bonus: launch Reel (Hinglish, c3 format, ~35s, 9:16)

**Format:** HOOK → UNEXPECTED → UNEXPECTED → HOOK → DELIVER VALUE · 2-second rule · CTA

| t | Visual (screen recording → animos 9:16 template) | Voiceover / on-screen text |
|---|---|---|
| 0–2s | Close-up: a WhatsApp forward, "Exercise se heart risk 40% kam!!" | **HOOK:** "Ye forward aapke family group mein bhi aaya hoga 👀" (text: *Sach ya jhooth?*) |
| 2–7s | Paste into ACHP → the claim flies onto the paper sheet | "Maine ek AI banaya jo ise *check* karta hai… par loading spinner nahi dikhata." |
| 7–14s | The scissors cut the claim into 3 strips; paperclips pin sources | **UNEXPECTED #1:** "7 AI agents live kaam karte dikhte hain: ek claim ko kaat-ta hai, ek sources pin karta hai…" |
| 14–20s | The red pencil strikes "40%"; the Kalam note "2 sources say 20–35%" | **UNEXPECTED #2:** "…aur ek agent literally red pencil se galti mark karta hai. Teacher vibes 😤" |
| 20–25s | The stamp slams: **MIXED**; the Hallmark punches in below it | **HOOK (re-hook):** "Verdict? Na full sach, na full jhooth: *Mixed*. Aur neeche 5 scores ka hallmark, jaise sone pe lagta hai." |
| 25–32s | The Share button → the WhatsApp preview with the stamp OG image | **VALUE:** "Har check ka link milta hai, sources ke saath. Forward karne se pehle bas paste karo." |
| 32–35s | The ACHP wordmark on the desk | **CTA:** "Link bio mein. Comment 'CHECK' karo, main aapka forward live check karunga." |

**Editing checklist:** captions burned in (Public Sans, not mono) · cut on each stamp or mark frame (match the 12fps steps for rhythm) · the product itself is silent, so the Reel's audio is your voiceover plus one low music bed (duck it −12 dB under speech) · a 1.1× zoom punch-in on the red pencil · a hard cut to silence and a 6-frame freeze on the stamp so the visual lands.
