# CLAUDE.md — project-aurora

Guidance for AI agents (and humans) working in this repository. Read this before making changes.

## What this is
A mobile MVP that helps tourists in Tromsø decide **where and when** to see the northern lights tonight.
- **Frontend:** React Native + Expo (TypeScript), with `.native.tsx` / `.web.tsx` variants for some screens. Root of repo.
- **Backend:** Fastify 5 (TypeScript, **ES modules**) in `backend/`.

## Architecture & data flow
1. `backend/src/sources.ts` — fetches raw data from external APIs (MET Norway weather, NOAA planetary K-index). Has deterministic fallbacks when a source fails.
2. `backend/src/scoring.ts` — turns weather + KP into a 0–100 aurora score per spot and picks the best 3-hour window.
3. `backend/src/snapshot.ts` — assembles the `TonightSnapshot` (all spots, rankings, KP trend, data-quality flags).
4. `backend/src/store.ts` — holds the latest snapshot in memory and mirrors it to `backend/data/latest-snapshot.json`.
5. `backend/src/server.ts` — serves it: `GET /v1/tonight`, `GET /v1/spots/:id`, `GET /v1/health`, `POST /v1/admin/refresh` (token-gated). Refreshes on an interval.

Spot definitions live in `src/data/spots.json` (frontend) — add/edit spots there.
The frontend can either call the backend (`EXPO_PUBLIC_USE_BACKEND=true`) or hit MET/NOAA directly.

## Commands
Root:
- `npm run typecheck` — TypeScript check for the app
- `npm run web` / `npm start` — run the Expo app
- `npm run test:kp` — verifies KP payloads parse (see `scripts/test-kp-fetch.mjs`)
- `npm run backend:dev` / `npm run backend:typecheck` — proxy into the backend

Backend (`cd backend`):
- `npm run dev` — tsx watch
- `npm run build` — `tsc` to `dist/`
- `npm run start` — `node dist/server.js`
- `npm run typecheck` — `tsc --noEmit`

## Conventions
- **ES modules in the backend.** `package.json` has `"type": "module"`, so relative imports MUST use the `.js` extension even for `.ts` files (e.g. `import { getSpots } from './snapshot.js'`). Do not drop the extension — it breaks the build.
- TypeScript strict; prefer explicit types on public functions and API payloads (see `backend/src/types.ts`).
- No secrets in code. Config comes from env: `PORT`, `HOST`, `REFRESH_MS`, `ADMIN_TOKEN`, `CORS_ORIGINS` (backend); `EXPO_PUBLIC_USE_BACKEND`, `EXPO_PUBLIC_API_BASE_URL` (frontend).
- Keep external-source calls resilient: always provide a fallback path, following the existing pattern in `sources.ts`.

## Definition of done (must pass before opening a PR)
1. `npm run typecheck` passes at root.
2. `cd backend && npm run typecheck` passes.
3. `npm run test:kp` passes.
4. `cd backend && npm run build` succeeds.
5. No secrets, tokens, or `.env` files committed.

## Workflow
- One scoped task per branch. Branch names: `feat/…`, `fix/…`, `chore/…`.
- Small PRs. Include a short "what/why" and how you verified it.
- Do NOT auto-merge. A human reviews and merges.
- If a task is ambiguous, state your assumption in the PR rather than guessing silently.

## Privacy guardrails (READ before touching data collection)
Any code that receives, stores, or exposes data from users is privacy-sensitive and **requires human review** — never merge it agentically.
- **Aggregate by default.** Collect event counts, not personal profiles. `spot_view`, `navigate_pressed`, etc. as anonymous events.
- **No PII, ever.** Do not store or log IP addresses, precise user coordinates, device IDs, or anything that identifies a person. Coarsen/round any location to spot-level.
- **Opt-in for anything richer** (e.g. user-submitted sighting reports): explicit consent, and still no identity.
- Stats endpoints intended for third parties (e.g. the municipality) must return **aggregates only** — never row-level records.
- If a change might touch personal data, stop and flag it in the PR for a human decision.
