# Architecture Context

## Stack

| Layer        | Technology                                      | Role                                              |
| ------------ | ----------------------------------------------- | ------------------------------------------------- |
| API          | NestJS + TypeScript                             | Domain, authz, scoring, timer, REST, WebSockets   |
| UI           | Next.js + TypeScript                            | Participant, observer, admin, and live/TV screens |
| Realtime     | NestJS Gateway + Socket.IO                      | Live score, rank, timer, presence, end events     |
| Database     | PostgreSQL + existing ORM (TypeORM or Prisma)   | Authoritative competition, job, and score state   |
| Cache / bus  | Redis                                           | Presence, leaderboard cache, Socket.IO adapter    |
| Workers      | BullMQ or existing NestJS queue                 | Finalization, notifications, cleanup, reconcile   |
| Media        | WebRTC + SFU (optional, later)                  | Screen share only — never scoring                 |

Inspect the existing Hirance NestJS and Next.js apps and
reuse their auth, ORM, queue, API client, and UI kit.

## System Boundaries

- `src/modules/live-challenge/` (or existing NestJS
  module path) — competition domain, lifecycle, scoring,
  leaderboard, timer, guards, gateway, processors
- Existing Job module / service — create and publish jobs;
  competition module orchestrates, does not duplicate
- Existing User / Company / CompanyMembership — identity
  and company resolution
- Existing auth / Passport / JWT / session — HTTP and
  WebSocket authentication
- Existing notification / email infrastructure — scheduled,
  started, ended, finalized, winner
- Next.js `app/competition/[id]/` (or existing router) —
  participant UI
- Next.js `app/competition/[id]/live/` — observer / TV UI
- Next.js `components/competition/` — live widgets
- Next.js `lib/competition/` — API client, socket client,
  shared types

Next.js is the UI layer only. NestJS owns scoring, timer
authority, authorization, and job-publish rules.

## Suggested NestJS module

```text
src/modules/live-challenge/
    live-challenge.module.ts
    constants.ts
    enums.ts
    exceptions.ts
    events.ts
    entities/
    dto/
    repositories/
    services/
    controllers/
    gateways/
    guards/
    processors/
    validators/
    tests/
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

- **PostgreSQL**: competitions, participants, jobs with
  nullable `competition_id`, audit events, final scores,
  final ranks. This is the only source of truth for score.
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
- **Participant**: view own competition, create/publish
  competition jobs, view permitted leaderboard. Cannot
  change score, rank, or timing.
- **Observer**: view competition, leaderboard, permitted
  participant info, authorized screens. Cannot publish
  or mutate competition state.
- **Competition admin**: create, schedule, register,
  start, cancel, end, finalize, inspect audit, view
  results.
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
countdown.

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
   Use transactional atomic increment / row locking.
5. PostgreSQL is authoritative. Redis is never the
   permanent score source.
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
