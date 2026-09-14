# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Competition-only server (webhook scoring) — local
  `/api/jobs` removed.
- Phases 0–8 from `details.md` §60 remain delivered.

## Current Goal

- Operate against an external job server: link
  `externalUserId`, ingest signed job-events, monitor
  `/api/metrics`.

## Completed

- Docker full stack in one `docker-compose.yml` (postgres, redis,
  livekit, api, web, nginx) for EC2:
  UI `test.amitverma01.dev`, API `api.test.amitverma01.dev`,
  LiveKit `live.test.amitverma01.dev`. `docker compose up -d --build`.
- Phase 0 — Monorepo init.
- Phase 1 — Competition domain + JWT auth + lifecycle.
- Phase 2 — Atomic score ledger (now webhook-fed only).
- Phase 3 — Socket.IO realtime gateway + web socket client.
- Phase 4 — Participant UI (score/rank; no in-app job form).
- Phase 5 — Observer / TV UI.
- External job server integration.
- Phase 6 — Audit / security:
  - Public `/auth/register` can no longer self-elevate;
    admins come from `POST /auth/admins` behind an
    existing-admin JWT or first-admin bootstrap token
  - Weak/missing `JWT_SECRET`, wildcard CORS, and short
    secrets fail the boot in production
  - Named rate-limit buckets (`default`, `auth`,
    `competition`) selected per route, tracked per
    verified user, all env-configurable; socket
    handshakes limited per address
  - Closed rosters by default (`allowOpenJoin` opt-in);
    disqualified participants cannot rejoin or share
  - Admin disqualification endpoint, `RECONNECTED` and
    screen-share audit events, filtered/paginated admin
    audit query
  - Authorization, idempotency, lifecycle, throttling,
    and config unit tests
- Phase 7 — Screen sharing (LiveKit).
- Phase 8 — Production hardening.
- Webhook-only cleanup:
  - Removed `JobsModule` / `/api/jobs` / `JobCreateEntry`
  - Scores only via `POST /api/integrations/job-events`
  - Kept User + Company names for display
  - `EXTERNAL_JOB_WEBHOOK_ENABLED`,
    `REQUIRE_EXTERNAL_USER_ID_ON_JOIN`
  - Smoke/load scripts use signed webhooks

## In Progress

- None yet.

## Next Up

- Wire host monitoring/alerts to `/api/metrics` and
  readiness (no Datadog in-repo).
- Run §54 100-participant load against staging
  (`EXTERNAL_JOB_WEBHOOK_SECRET` required).
- Decide admin UI surface (open question below).

## Open Questions

- Confirm whether an admin UI should live in Next.js
  or as NestJS admin endpoints only for early phases.

## Architecture Decisions

- Participant UI is Client Components for sockets/timer.
- Session token stored in `localStorage` for demo auth
  (not score authority).
- This API does not create jobs. The external job server
  publishes jobs and POSTs HMAC-signed events to
  `/api/integrations/job-events`.
- Users and Companies stay for display names on
  leaderboard / roster windows.
- Observer/TV clients use the same HTTP snapshot plus
  Socket.IO recovery path as participant clients.
- Competition observer feeds require an administrator
  or registered participant.
- External ingest uses receive-time eligibility against
  `end_at`; job-server `published_at` is audit-only.
- Multi-tab policy: one active competition socket per
  participant; newer join supersedes older.
- `ADMIN_BOOTSTRAP_TOKEN` is first-admin only.
- Competition rosters are closed unless the admin sets
  `allowOpenJoin`; self-service join is opt-in per
  competition.
- Rate limits are route-scoped named buckets tracked by
  verified user id rather than IP.
- Screen media uses LiveKit SFU; Nest only issues /
  revokes credentials.
- Redis/WebSocket failures must not corrupt Postgres
  scores; realtime broadcasts are best-effort after commit.

## Session Notes

- Open `/competition/<uuid>` after creating a competition
  via API. Sign in as an employer; enter job-server
  `externalUserId` on join.
- Open `/competition/<uuid>/live` for the authenticated
  presentation screen.
- For screen share locally: `docker compose up -d livekit`
  and set `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL`,
  `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret`
  in `apps/api/.env`.
- POST signed events to `/api/integrations/job-events`.
- Provision the first admin with `x-admin-bootstrap-token`;
  afterward use an admin JWT for `/api/auth/admins`.
- Load tests (API running):
  `EXTERNAL_JOB_WEBHOOK_SECRET=... ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run load:competition -w api`
  `PARTICIPANTS=100` for the §54 target.
  `npm run load:ws-capacity -w api` for observer sockets.
- Full local test walkthrough (webhooks + UI):
  [`docs/LOCAL_TESTING.md`](../docs/LOCAL_TESTING.md).
- Deployment, production env, and job-server integration:
  [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).
- EC2: `docker compose up -d --build` then `npm run ssl:cert:webroot`.
