# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Pre-code, planning stage. Repo contains strategy/design docs only — no source, no build tooling, no tests, no git history yet.

No build/lint/test commands exist. Nothing to run.

## Doc map

- `BUSINESS.md` — strategy, market sizing, pricing, revenue model, risk management (investor-facing pitch)
- `DESIGN.md` — technical architecture: data model, matching pipeline, reveal mechanics, privacy architecture, AI-Credit Marketplace
- `VISION.md` — mission, north star metric, phased OKRs, evaluation cadence, kill-criteria
- `MEMORY.md` — append-only execution-lesson log of founding decisions and why they were made
- `LEGAL_REVIEW.md` — briefing memo for SG/HK counsel on the points-economy licensing exemption; hard blocker on the AI-Credit Marketplace feature until reviewed
- `README.md` — project overview and current setup status

Product: JumpOnBoard (J.O.B.), a privacy-first AI hiring-matching platform for HK/SG. Planned stack: Next.js frontend, Supabase (Postgres + pgvector + RLS) in AWS ap-east-1, serverless open-weight LLM inference (Llama 3/Mistral via Modal/Baseten). See DESIGN.md for the full architecture before making implementation decisions.

## For future instances

Once code, config, or dependencies land, update this file with real build/lint/test commands. Don't leave this placeholder stale.
