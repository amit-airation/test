# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Admin console + closed-roster mobile join delivered.
- Company identity: `companyId` + `companyName` + unique
  `mobile`; participants join with mobile + shared PIN.
- Webhook scoring still by `company_id` only.
- Phases 0–8 from `details.md` §60 remain delivered.

## Current Goal

- Operate admin UI on staging; run events with mobile
  join; ingest signed job-events; monitor `/api/metrics`.

## Completed

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

- Participant UI is Client Components for sockets/timer.
- Closed roster: no self-join with company id/name.
- Join PIN is the only secret configured in the admin UI;
  `ADMIN_KEY`, `EVENT_ACCESS_KEY`, webhook secret stay in `.env`.
- Company identity in `localStorage` for session restore
  (not score authority); PIN is never stored.
- Webhook attribution remains `company_id`.
- Observer/TV uses event key only (no mobile login).

## Session Notes

- Screen share on staging: set `LIVEKIT_NODE_IP` to the
  EC2 Elastic IP, open SG TCP 7881 + UDP 7882, then
  `docker compose up -d --force-recreate livekit`.
  Negotiation timeout = ICE cannot reach media ports /
  wrong advertised IP (not WSS signaling).
- Admin: `/admin` — paste `ADMIN_KEY`.
- Participant: `/competition/<id>` — mobile + PIN.
- TV: `/competition/<id>/live`.
- Local webhook walkthrough: [`docs/LOCAL_TESTING.md`](../docs/LOCAL_TESTING.md).
- Production: [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).
