# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Company identity cleanup complete: no `displayName`,
  no JWT/`externalUserId`; join + leaderboard use
  `companyId` + `companyName`; webhook match by
  `company_id` with optional `company_name` refresh.
- Competition-only server (webhook scoring) — local
  `/api/jobs` removed.
- Phases 0–8 from `details.md` §60 remain delivered.

## Current Goal

- Operate against an external job server: join with
  `companyId`/`companyName`, ingest signed job-events,
  monitor `/api/metrics`.

## Completed

- Docker full stack in one `docker-compose.yml` (postgres, redis,
  livekit, api, web, nginx) for EC2:
  UI `test.amitverma01.dev`, API `api.test.amitverma01.dev`,
  LiveKit `live.test.amitverma01.dev`. `docker compose up -d --build`.
- Phase 0 — Monorepo init.
- Phase 1 — Competition domain + key auth + lifecycle.
- Phase 2 — Atomic score ledger (webhook-fed only).
- Phase 3 — Socket.IO realtime gateway + web socket client.
- Phase 4 — Participant UI (score/rank; no in-app job form).
- Phase 5 — Observer / TV UI.
- External job server integration.
- Phase 6 — Audit / security (key guards, rate limits,
  closed/open join, disqualification, audit query).
- Phase 7 — Screen sharing (LiveKit).
- Phase 8 — Production hardening.
- Webhook-only cleanup + company identity:
  - Removed `JobsModule` / `/api/jobs`
  - Scores only via `POST /api/integrations/job-events`
  - Identity = `Company.id` + `Company.name` (no User,
    no `displayName`, no `externalUserId`)
  - Round scoring window = `endAt + 3s`
  - `postDurationSeconds` between scored webhooks
  - Event TV UI polished for company-name leaderboard
  - Production docs rewritten for key auth + company_id
    ([`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md),
    [`docs/LOCAL_TESTING.md`](../docs/LOCAL_TESTING.md))

## In Progress

- None yet.

## Next Up

- Wire host monitoring/alerts to `/api/metrics` and
  readiness (no Datadog in-repo).
- Run §54 100-participant load against staging
  (`EXTERNAL_JOB_WEBHOOK_SECRET` + keys required).

## Open Questions

- Confirm whether an admin UI should live in Next.js
  or remain NestJS admin endpoints only (`x-admin-key`).

## Architecture Decisions

- Participant UI is Client Components for sockets/timer.
- Company identity stored in `localStorage` for join
  restore (not score authority).
- This API does not create jobs. The external job server
  publishes jobs and POSTs HMAC-signed events to
  `/api/integrations/job-events`.
- Webhook attribution is by `company_id`; optional
  `company_name` refreshes display only.
- Observer/TV clients use the same HTTP snapshot plus
  Socket.IO recovery path as participant clients.
- External ingest uses receive-time eligibility against
  `endAt + 3s`; job-server `published_at` is audit-only.
- Multi-tab policy: one active competition socket per
  participant; newer join supersedes older.
- Screen media uses LiveKit SFU; Nest only issues /
  revokes credentials.
- Redis/WebSocket failures must not corrupt Postgres
  scores; realtime broadcasts are best-effort after commit.

## Session Notes

- Production setup (EC2 / Compose / webhook / runbook):
  [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).
- Live `.env` includes `ADMIN_KEY`, `EVENT_ACCESS_KEY`,
  matching `NEXT_PUBLIC_EVENT_KEY`, webhook secret, LiveKit.
  Web Dockerfile bakes `NEXT_PUBLIC_EVENT_KEY` — rebuild web
  after changing it (`docker compose up -d --build`).
- Local webhook + UI walkthrough:
  [`docs/LOCAL_TESTING.md`](../docs/LOCAL_TESTING.md).
- Open `/competition/<uuid>` after creating a competition
  via API. Enter `companyId` + `companyName` to join.
- Open `/competition/<uuid>/live` for the presentation
  screen (`NEXT_PUBLIC_EVENT_KEY`).
- For screen share locally: `docker compose up -d livekit`
  and set `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL`,
  `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in env.
- POST signed events to `/api/integrations/job-events`.
- Admin APIs use `x-admin-key` (`ADMIN_KEY`).
- Load tests (API running):
  `EXTERNAL_JOB_WEBHOOK_SECRET=... ADMIN_KEY=... EVENT_ACCESS_KEY=... npm run load:competition -w api`
  `PARTICIPANTS=100` for the §54 target.
  `npm run load:ws-capacity -w api` for observer sockets.
- EC2: `docker compose up -d --build` then `npm run ssl:cert:webroot`.
