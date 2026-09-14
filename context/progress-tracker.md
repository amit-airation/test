# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Phase 8 complete — production hardening.
- All eight delivery phases from `details.md` §60 are done.

## Current Goal

- Operate / iterate: run load scripts against a staging
  environment, wire `/api/metrics` into host monitoring,
  resolve open admin-UI question.

## Completed

- Phase 0 — Monorepo init.
- Phase 1 — Competition domain + JWT auth + lifecycle.
- Phase 2 — Competition-aware job publish + atomic score.
- Phase 3 — Socket.IO realtime gateway + web socket client.
- Phase 4 — Participant UI.
- Phase 5 — Observer / TV UI.
- External job server integration.
- Phase 6 — Audit / security.
- Phase 7 — Screen sharing (LiveKit).
- Phase 8 — Production hardening:
  - Failure isolation: realtime emit never fails scoring
  - `/api/health/live`, `/api/health/ready`, `/api/metrics`
  - In-process competition metrics + alert hints
  - Redis presence timeouts + atomic session Lua swap
  - Index review documented; EXPLAIN helper script
  - Load script (`load:competition`) and WS capacity
    script (`load:ws-capacity`)
  - Unit tests for metrics + Redis/WS failure isolation

## In Progress

- None yet.

## Next Up

- Wire host monitoring/alerts to `/api/metrics` and
  readiness (no Datadog in-repo).
- Run §54 100-participant load against staging.
- Decide admin UI surface (open question below).

## Open Questions

- Confirm whether an admin UI should live in Next.js
  or as NestJS admin endpoints only for early phases.

## Architecture Decisions

- Participant UI is Client Components for sockets/timer.
- Session token stored in `localStorage` for demo auth
  (not score authority).
- Job create/publish calls Nest `/api/jobs` with
  `competitionId`; score still authoritative on server.
- Primary competition scoring origin is the external job
  server webhook; local `/api/jobs` remains for demos.
- Observer/TV clients use the same HTTP snapshot plus
  Socket.IO recovery path as participant clients.
- Competition observer feeds require an administrator
  or registered participant.
- External ingest uses receive-time eligibility against
  `end_at`; job-server `published_at` is audit-only.
- Multi-tab policy: one active competition socket per
  participant; newer join supersedes older.
- `ADMIN_BOOTSTRAP_TOKEN` is first-admin only.
- Screen media uses LiveKit SFU; Nest only issues /
  revokes credentials.
- Redis/WebSocket failures must not corrupt Postgres
  scores; realtime broadcasts are best-effort after commit.

## Session Notes

- Open `/competition/<uuid>` after creating a competition
  via API. Sign in as an employer participant.
- Open `/competition/<uuid>/live` for the authenticated
  presentation screen.
- For screen share locally: `docker compose up -d livekit`
  and set `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL`,
  `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret`
  in `apps/api/.env`.
- Link a job-server user id via register/join
  `externalUserId`, then POST signed events to
  `/api/integrations/job-events`.
- Provision the first admin with `x-admin-bootstrap-token`;
  afterward use an admin JWT for `/api/auth/admins`.
- Load tests (API running):
  `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run load:competition -w api`
  `PARTICIPANTS=100` for the §54 target.
  `npm run load:ws-capacity -w api` for observer sockets.
  `COMPETITION_ID=... npm run explain:competition -w api`
  for index plans.
