---
title: ACHP API
emoji: 🔍
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
app_port: 7860
---

# ACHP — Automated Claim & Hallucination Pipeline API

7-agent adversarial fact-checking pipeline.

- `GET  /health` — liveness check
- `POST /analyze` — run full pipeline on a claim
- `POST /kb/upload` — ingest documents
- `GET  /docs` — Swagger UI
