# Mission: get project-aurora launch-ready

> Hand this to the orchestrator (Fable). This is a destination, not a recipe —
> YOU own the decomposition. Read CLAUDE.md first; the detailed rules and the
> worker agents' scopes live there and in `.claude/agents/`.

## The app
An Expo / React Native app that helps tourists in Tromsø decide where and when to
see the northern lights, backed by a Fastify + TypeScript service that scores spots
from live weather (MET) and geomagnetic (NOAA) data. It works, but it is an MVP:
read-only, no persistence, no automated tests, not yet deployed.

## The end goal
Make this app ready to put in front of real users. "Launch-ready" means:
- **Trustworthy backend.** It persists data, survives restarts, and stays up when an
  upstream source (MET/NOAA/UiT) fails or changes shape — degrade, don't crash.
- **Data collection that creates value.** The app can capture anonymous, aggregate
  usage of spots (a dataset that matters to the municipality: where and when tourists
  head out), designed privacy-first — counts, never people.
- **Deployable.** The service can be hosted with proper configuration and secret
  handling, reproducibly, not just run on a laptop.
- **Safe to change.** Quality gates (lint, tests, CI) exist so future changes — by
  humans or agents — can't silently break the build or the data pipeline.

## How to work
- Work through git worktrees and open ONE coherent PR per unit of work. Never push or
  merge to `main`; a human reviews and merges.
- Delegate implementation, tests, and review to the worker subagents. Stay thin: you
  coordinate and verify, you don't write code yourself.
- Sequence by risk: do the low-risk quality/infra work first so the pipeline is proven
  before the data-collection work, which is privacy-sensitive and MUST be flagged for
  human review (it touches CODEOWNERS-protected paths).
- Respect the budget cap. Don't parallelize by default. Don't gold-plate.

## First step — plan, then pause
Before writing any code, produce a **prioritized plan**: the sequence of PRs you'd open
to reach the end goal, each with a one-line rationale and a rough size. Then STOP and
wait for human approval of the plan. Only after approval, execute it one PR at a time.

## Flag to a human — do not decide these yourself
- Choice of hosting provider and anything that spends money or provisions infra.
- Real secrets / credentials (you use `.env.example` only).
- Anything involving personal data beyond anonymous aggregates (GDPR sign-off).
- Go-live timing (the aurora season, marketing) — a product decision, not yours.
