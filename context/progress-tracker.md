# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- LiveKit Cloud for screen share (staging + production);
  singleton competition + screen-share-only participants
  delivered.
- Job-server integration guide published
  (`docs/JOB_SERVER_INTEGRATION.md`).
- Admin console + closed-roster mobile join delivered.
- Company identity: `companyId` + `companyName` + unique
  `mobile`; participants join with mobile + shared PIN.
- Webhook scoring still by `company_id` only.
- Phases 0–8 from `details.md` §60 remain delivered
  (participant UI narrowed to screen share).

## Current Goal

- Operate admin UI on staging; run events with mobile
  join; ingest signed job-events; monitor `/api/metrics`.

## Completed

- Singleton competition: create returns 409 if one
  already exists; `GET /api/competitions/current`.
- Round `start` sets `activeRoundId` and rejects a second
  concurrent LIVE round.
- Participant UI: join + screen share only (no score /
  rank / timer / leaderboard on participant page).
- Home auto-routes to the current competition; admin
  redirects to the singleton console when it exists.
- Job-server guide: lifecycle REST + HMAC webhook.
- Admin Next.js UI (`/admin`, `/admin/[id]`):
  sessionStorage `ADMIN_KEY` gate, create competition,
  rounds lifecycle, mobile roster, join PIN, audit events,
  copy participant/TV links.
- Closed roster: admin registers `companyId` + `companyName`
  + `mobile`; join is `{ mobile, password }` only (default
  PIN `123456`, hashed as `Competition.joinPinHash`).
- API: `GET /competitions`, `GET /competitions/:id/events`,
  `PATCH /competitions/:id/join-pin`, CORS admin headers,
  `DRAFT → LIVE` start allowed.
- Prisma: `Company.mobile` (unique), `Competition.joinPinHash`.
- Docker Compose publishes Postgres `5432` for local tooling.
- Docker full stack in one `docker-compose.yml` (postgres, redis,
  livekit, api, web, nginx) for EC2.
- Phases 0–8 + webhook-only scoring + company identity
  (no User / JWT).

## In Progress

- None yet.

## Next Up

- Deploy schema + admin UI to staging
  (`prisma migrate deploy` / rebuild web).
- Wire host monitoring/alerts to `/api/metrics`.
- Run §54 100-participant load against staging.

## Open Questions

- None for admin surface — Next.js `/admin` is the operator UI.

## Architecture Decisions

- One competition for the product; many rounds with
  per-round participants.
- Participant UI is Client Components for sockets /
  LiveKit only (no score chrome).
- Closed roster: no self-join with company id/name.
- Join PIN is the only secret configured in the admin UI;
  `ADMIN_KEY`, `EVENT_ACCESS_KEY`, webhook secret stay in `.env`.
- Company identity in `localStorage` for session restore
  (not score authority); PIN is never stored.
- Webhook attribution remains `company_id`.
- Observer/TV uses event key only (no mobile login).
- Job server may use `ADMIN_KEY` for lifecycle and HMAC
  for scoring (`docs/JOB_SERVER_INTEGRATION.md`).

## Session Notes

- Screen share (staging + prod): LiveKit Cloud via
  `LIVEKIT_*` in repo-root `.env`. Recreate API after
  changes: `docker compose up -d --force-recreate api`.
  No EC2 ports 7881/7882; no `live.*` nginx vhost.
- Admin: `/admin` — paste `ADMIN_KEY`.
- Participant: `/` → `/competition/<id>` — mobile + PIN →
  screen share.
- TV: `/competition/<id>/live`.
- Job-server guide: [`docs/JOB_SERVER_INTEGRATION.md`](../docs/JOB_SERVER_INTEGRATION.md).
- Local webhook walkthrough: [`docs/LOCAL_TESTING.md`](../docs/LOCAL_TESTING.md).
- Production: [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).
