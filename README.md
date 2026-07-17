# JumpOnBoard (J.O.B.)

Privacy-first, AI-driven hiring platform for APAC (Hong Kong & Singapore) — anonymized-by-default candidate matching, consent-first reveals, and a closed-loop points economy in place of ads/cold-outbound recruiting.

## Status

Pre-code, planning stage. This repo currently contains strategy and design documentation only — no application code, no scaffolding, nothing to build/run/test yet.

## Doc Map

| File | Purpose |
|---|---|
| [BUSINESS.md](./BUSINESS.md) | Strategy, market sizing, pricing, revenue model, risk management — the investor-facing pitch document |
| [DESIGN.md](./DESIGN.md) | Technical architecture — data model, matching pipeline, reveal mechanics, privacy architecture, AI-Credit Marketplace |
| [VISION.md](./VISION.md) | Mission, north star metric, phased OKRs, evaluation cadence, kill-criteria |
| [MEMORY.md](./MEMORY.md) | Append-only execution-lesson log — founding decisions, why they were made, and outcomes as they're learned |
| [LEGAL_REVIEW.md](./LEGAL_REVIEW.md) | Briefing memo for SG/HK counsel on the points-economy/AI-Credit Marketplace licensing exemption question — a hard blocker on that feature until reviewed |
| [CLAUDE.md](./CLAUDE.md) | Guidance for Claude Code instances working in this repo |

## Planned Stack (see DESIGN.md for detail)

- Frontend: Next.js (React)
- Backend: Supabase (Postgres + pgvector + RLS), hosted in AWS ap-east-1
- AI/matching: serverless open-weight LLM inference (Llama 3 / Mistral) via Modal or Baseten
- Solo-founder build, AI-assisted ("vibe coding")

## Next Steps

No code exists yet. Once implementation begins, this README should be updated with actual setup/build/run instructions — this placeholder should not go stale once that happens.
