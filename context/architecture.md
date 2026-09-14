# Architecture Context

## Stack

| Layer        | Technology                                      | Role                                              |
| ------------ | ----------------------------------------------- | ------------------------------------------------- |
| API          | NestJS + TypeScript (Nest CLI)                  | Domain, authz, scoring, timer, REST, WebSockets   |
| UI           | Next.js + TypeScript                            | Participant, observer, admin, and live/TV screens |
| Realtime     | NestJS Gateway + Socket.IO (`nest g gateway`)   | Live score, rank, timer, presence, end events     |
| Database     | Prisma 7 + PostgreSQL                           | Authoritative competition, job, and score state   |
| Cache / bus  | Redis                                           | Presence, leaderboard cache, Socket.IO adapter    |
| Workers      | BullMQ or existing NestJS queue                 | Finalization, notifications, cleanup, reconcile   |
| Media        | WebRTC + LiveKit SFU                            | Screen share only — never scoring                 |
| Edge         | Nginx (Docker)                                  | TLS for UI `test.amitverma01.dev` + API `api.test.amitverma01.dev` |

Greenfield monorepo layout (Phase 0):

```text
apps/api/   NestJS API (port 3001, global prefix /api)
apps/web/   Next.js App Router (port 3000)
```

Reuse auth, queue, API client, and UI kit as they are added.
Do not introduce TypeORM. Prisma 7 uses `prisma.config.ts`, the
`prisma-client` generator, and `@prisma/adapter-pg`.

## System Boundaries

- `src/modules/live-challenge/` — competition domain,
  lifecycle, scoring, leaderboard, timer, guards, gateway,
  external job-event ingest
- External job server — creates/publishes jobs; calls
  `POST /api/integrations/job-events` (HMAC) so this API
  can score. There is no local `/api/jobs` module.
- Existing User / Company / CompanyMembership — identity
  and display names on leaderboard / roster
- Existing auth / Passport / JWT / session — HTTP and
  WebSocket authentication
- Existing notification / email infrastructure — scheduled,
  started, ended, finalized, winner
- Next.js `app/competition/[id]/` (or existing router) —
  participant UI (score/rank/leaderboard; no job create)
- Next.js `app/competition/[id]/live/` — observer / TV UI
- Next.js `components/competition/` — live widgets
- Next.js `lib/competition/` — API client, socket client,
  shared types
- LiveKit SFU — screen media only. NestJS mints short-lived
  room tokens; Next.js participant/observer clients connect
  with `livekit-client`. Video never traverses Nest sockets.

Next.js is the UI layer only. NestJS owns scoring, timer
authority, and authorization. Job CRUD lives on the
external job server.

## CLI-first NestJS module

Generate with the Nest CLI, then fill in logic:

```bash
nest g module modules/live-challenge
nest g resource modules/live-challenge/competition
nest g module prisma
nest g service prisma --flat
nest g gateway modules/live-challenge/gateways/competition --flat
nest g guard modules/live-challenge/guards/competition-participant
```

```text
src/modules/live-challenge/
    live-challenge.module.ts
    constants.ts
    enums.ts
    exceptions.ts
    events.ts
    dto/
    services/
    controllers/
    gateways/
    guards/
    processors/
    validators/
    tests/

prisma/schema.prisma
prisma/migrations/
prisma.config.ts
src/generated/prisma/
src/prisma/prisma.module.ts
src/prisma/prisma.service.ts
```

## Suggested Next.js surfaces

```text
app/competition/[id]/page.tsx
app/competition/[id]/live/page.tsx
components/competition/
lib/competition/
```

Follow the existing monorepo or app-folder layout if it
differs.

## Storage Model

- **PostgreSQL via Prisma 7**: competitions, participants,
  jobs with nullable `competitionId`, `User.externalUserId`,
  `Job.externalJobId` / `Job.source`, audit events, final
  scores, final ranks. This is the only source of truth
  for score. External publishes are mirrored into `Job`
  (`source = EXTERNAL`) so reconciliation still works.
  Initialize with `npx prisma init
  --datasource-provider postgresql`. Evolve with
  `npx prisma migrate dev` and `npx prisma generate`.
- **Redis**: Socket.IO adapter fan-out, presence,
  heartbeat, short-lived leaderboard cache, optional
  locks, BullMQ backing store.
- **WebRTC / SFU** (optional): screen-share media only.
  NestJS may mint short-lived credentials. It does not
  carry video frames.

Score conceptually:

```text
COUNT(jobs)
WHERE competition_id = X
  AND created_by = participant
  AND status = PUBLISHED
  AND published_at IS NOT NULL
```

A cached participant counter is allowed only if it is
updated transactionally, increment-idempotent, and
reconcilable against Jobs.

## Auth and Access Model

- Authenticate HTTP and WebSocket with the existing
  NestJS strategy (JWT, cookie, Passport, etc.).
- Resolve company through existing CompanyMembership.
  Do not duplicate membership logic.
- **Participant**: view own competition, link
  `externalUserId`, view score/rank/leaderboard. Cannot
  change score, rank, or timing. Publishes happen on the
  external job server and are attributed through
  `User.externalUserId`.
- **External job server**: HMAC-signed ingest only. Cannot
  set score, rank, or timer. Must not use participant JWT.
- **Observer**: view competition, leaderboard, permitted
  participant info, authorized screens. Cannot publish
  or mutate competition state.
- **Competition admin**: create, schedule, register,
  start, cancel, end, finalize, disqualify, inspect audit,
  view results.
- Rosters are closed by default. `POST /competitions/:id/join`
  admits only participants an admin registered unless the
  competition sets `allowOpenJoin`. Public `/auth/register`
  always creates an EMPLOYER; ADMIN comes only from
  `POST /auth/admins`.
- Next.js may hide unauthorized UI. Hiding UI is not
  authorization. NestJS guards and services remain the
  authority.
- Permission-check every socket connection and room join.
  A participant must not join another private participant
  room.

## Competition lifecycle

```text
DRAFT → SCHEDULED → LIVE → ENDED → FINALIZED
```

Invalid transitions are rejected (for example
`DRAFT → FINALIZED`, `FINALIZED → LIVE`,
`LIVE → SCHEDULED`) unless an explicit admin operation
is documented.

At start: set `actual_start_at`, calculate `end_at`, set
`LIVE`, broadcast `COMPETITION_STARTED`, enqueue
finalization work.

At `end_at`: reject new competition publishes, freeze
scores, rank deterministically, store winner, broadcast
`COMPETITION_ENDED`, then finalize.

Publish policy:

```text
published successfully before end_at = counts
published after end_at = does not count
```

Use server / database timestamps. Never the Next.js
countdown. For external ingest, eligibility uses this
NestJS receive time — never the job server's
`published_at`.

## Realtime model

```text
HTTP → initial state / recovery
WebSocket → live updates
PostgreSQL → authoritative state
Redis → ephemeral realtime state
```

Rooms:

```text
competition:<competition_id>
competition:<competition_id>:participant:<participant_id>
```

Broadcast score and leaderboard events only after the
database transaction commits.

If NestJS runs more than one instance, use the Redis
Socket.IO adapter.

Next.js holds sockets only in Client Components.

## Invariants

1. Never trust client score or client `Date.now()`.
2. Score increases only after a successful published job
   commit. Drafts and failed publishes are +0.
3. Retries must not double-count a job. Use job identity
   and/or an idempotency key plus a unique constraint.
4. Do not increment score with a read-modify-write save.
   Use `prisma.$transaction` and `finalScore: { increment: 1 }`
   or row locking.
5. PostgreSQL via Prisma 7 is authoritative. Redis is
   never the permanent score source.
6. Do not create a second Job model or a second publish
   implementation.
7. Do not put scoring, timer authority, or publish rules
   in Next.js Route Handlers.
8. Do not stream video through NestJS WebSockets.
9. Do not depend only on BullMQ to decide whether the
   competition is over. The HTTP API checks timestamps.
10. Do not broadcast `SCORE_UPDATED` before commit.
11. Finalized results are immutable unless an explicit
    admin correction workflow exists.
12. Tie-break is deterministic: score DESC, then earlier
    timestamp of reaching that score ASC.
13. Reconnect never resets timer or score.
14. A Redis / WebSocket failure must not corrupt the
    authoritative score.
15. External job ingest is HMAC-authenticated. Retries
    must not double-count (`Job.externalJobId` unique +
    `CompetitionJobScore.jobId` unique).
16. External score attribution resolves the user's single
    currently LIVE participation. Never trust a client-
    supplied competition id on the webhook.
17. One active competition WebSocket session per
    participant. A newer join supersedes the older socket
    (`SESSION_SUPERSEDED`); the kicked tab must not clear
    the new session or write a false disconnect audit.
18. Admin bootstrap token works only until the first ADMIN
    exists; afterward provisioning requires an admin JWT.
19. Screen sharing uses LiveKit. NestJS only mints short-
    lived credentials and revokes rooms/publishers. Media
    never flows through Nest WebSockets. Sharing never
    affects score.
20. Rate limits are named buckets chosen per route with
    `@RateLimit` (`default`, `auth`, `competition`) and
    tracked per verified user id, falling back to IP.
    Every limit is env-configurable so the high-frequency
    publish path is never throttled for legitimate play.
    Socket handshakes have their own per-address budget.
21. Observability: `/api/health/live` is process liveness;
    `/api/health/ready` checks Postgres (required) and
    Redis (degraded if down). `/api/metrics` exposes
    in-process counters. Alert on publish failure rate,
    realtime emit failures, and ready=down.

## Observability & hardening (Phase 8)

- Metrics live in `CompetitionMetricsService` (in-process).
  There is no Datadog agent in this repo yet — wire the
  JSON snapshot or structured logs into the host platform.
- `CompetitionRealtimeService.emitScoreAndLeaderboard`
  never throws to scoring callers.
- Presence Redis uses short timeouts, no offline queue,
  and an atomic Lua session swap.
- Load / capacity scripts:
  - `npm run load:competition -w api`
  - `npm run load:ws-capacity -w api`
  - `npm run explain:competition -w api`

## Index review (Phase 8)

Existing Prisma indexes cover the §41 query shapes:

| Query | Index |
| ----- | ----- |
| Leaderboard order | `CompetitionParticipant(competitionId, finalScore, scoreReachedAt)` |
| Live end timer | `Competition(status, endAt)` |
| Schedule start | `Competition(status, scheduledStartAt)` |
| Competition jobs | `Job(competitionId, status, createdById, publishedAt)` |
| Event timeline | `CompetitionEvent(competitionId, eventType, createdAt)` |
| External user | `User.externalUserId` UNIQUE |

Use `explain:competition` under load before adding more.
