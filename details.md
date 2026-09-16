# Build: Hirance Live Job Creation Competition

## Objective

Build a production-grade real-time competition feature for Hirance.

The competition is for HRs/founders/employers.

Each participant gets a fixed amount of time, initially **5 minutes**, to create and successfully publish as many valid jobs as possible.

### Winning rule

> The participant with the highest number of successfully published competition jobs when the round ends is the winner. If tied on count, the earlier timestamp of reaching that score (webhook receive time / `scoreReachedAt`) wins.

Only a **successfully published, valid competition job** counts toward the score.

Creating a draft, failed validation, failed publish, deleted job, or incomplete job must never increase the score.

The system must provide:

* Competition management
* Participant registration
* Server-authoritative timer
* Job creation during competition
* Successful-publish counting
* Real-time score updates
* Real-time leaderboard
* Real-time rank changes
* Candidate/participant dashboard
* Observer/admin live dashboard
* Optional live screen sharing
* Competition audit trail
* Competition start/end/finalization
* Winner determination
* Reconnection handling
* Anti-cheating / abuse controls
* Concurrency-safe scoring
* Production-grade observability

---

# 1. First inspect the existing codebase

The stack is **NestJS** on the backend and **Next.js** on the frontend.

Before writing code:

1. Inspect the complete NestJS API and Next.js app structure.
2. Identify:

   * User entity / model
   * Employer entity / model
   * Company entity / model
   * CompanyMembership
   * Job entity / model
   * Job status implementation
   * Job creation APIs
   * Job publish APIs
   * Guards, policies, and permission checks
   * Authentication (JWT / session / Passport)
   * Redis configuration
   * Queue / worker configuration (BullMQ or existing queue)
   * WebSocket / Socket.IO gateway implementation
   * Prisma 7 + PostgreSQL (`prisma/schema.prisma`, `prisma.config.ts`, generated client)
   * existing notification/event systems
   * Next.js app router (or pages router), shared UI, and job-creation components
3. Identify existing reusable modules, services, DTOs, and UI components.
4. Do NOT create duplicate implementations.
5. Reuse existing:

   * User/company relationships
   * Job publishing logic
   * authentication
   * guards / permissions
   * WebSocket infrastructure
   * event/notification patterns
   * Next.js job creation UI
6. Preserve existing API response shapes unless a new competition endpoint is required.
7. Do not make unrelated UI or architecture changes.

Before implementation, produce a short architecture assessment and identify where each new feature belongs.

---

# 2. Architectural principles

Follow:

* SSOT — Single Source of Truth
* DRY
* KISS
* SOLID
* ACID
* YAGNI
* least privilege
* secure-by-default
* production-grade concurrency handling
* optimized PostgreSQL queries
* proper indexing
* idempotency
* transactional integrity
* clear separation of responsibilities

Do not introduce microservices unless the existing architecture genuinely requires them.

The initial implementation should remain compatible with the existing:

* NestJS
* Next.js
* PostgreSQL
* Redis
* BullMQ (or the existing NestJS queue/worker stack)
* WebSockets / Socket.IO
* Prisma 7 + PostgreSQL

architecture.

If the API or database does not exist yet, initialize them with CLIs. Do not hand-roll NestJS modules, controllers, services, gateways, or Prisma config when a schematic or Prisma command can create them.

All competition business logic, scoring, timers, and authorization live in NestJS.

Next.js is the UI layer. Do not put competition scoring, timer authority, or job-publish rules in Next.js Route Handlers / API routes.

---

# 3. CLI-first NestJS module and Prisma 7

Create NestJS building blocks with the **Nest CLI**. Create and evolve the database with the **Prisma 7 CLI**. Hand-write only the business logic inside those generated files.

If the NestJS app does not exist:

```bash
npm i -g @nestjs/cli
nest new api
```

Use the existing NestJS app path if one already exists (`apps/api`, `backend`, etc.).

## 3.1 Generate NestJS components with the CLI

From the NestJS app root:

```bash
nest g module modules/live-challenge
nest g resource modules/live-challenge/competition --no-spec false
```

Prefer `nest g` / `nest generate` for almost every NestJS artifact:

```bash
nest g module prisma
nest g service prisma --flat

nest g service modules/live-challenge/services/competition-lifecycle --flat
nest g service modules/live-challenge/services/competition-scoring --flat
nest g service modules/live-challenge/services/competition-leaderboard --flat
nest g service modules/live-challenge/services/competition-timer --flat

nest g gateway modules/live-challenge/gateways/competition --flat

nest g guard modules/live-challenge/guards/competition-participant
nest g guard modules/live-challenge/guards/competition-admin
nest g guard modules/live-challenge/guards/competition-observer

nest g class modules/live-challenge/dto/create-competition.dto --no-spec
nest g class modules/live-challenge/dto/join-competition.dto --no-spec
nest g class modules/live-challenge/dto/competition-query.dto --no-spec

nest g interceptor modules/live-challenge/interceptors/idempotency
nest g filter modules/live-challenge/filters/competition-exception
nest g pipe modules/live-challenge/pipes/competition-status
```

Install official Nest packages with the CLI or npm when a schematic needs them (`@nestjs/websockets`, `@nestjs/platform-socket.io`, `@nestjs/config`, `@nestjs/bullmq`, `@nestjs/throttler`, `@nestjs/jwt`, etc.). Do not invent a parallel folder layout that the schematics will not own.

Keep competition-specific functionality isolated from the normal Jobs/Application domain.

Suggested structure after CLI generation:

```text
src/modules/live-challenge/
    live-challenge.module.ts
    constants.ts
    enums.ts
    exceptions.ts
    events.ts

    dto/
        create-competition.dto.ts
        join-competition.dto.ts
        competition-query.dto.ts

    services/
        competition.service.ts
        competition-lifecycle.service.ts
        competition-scoring.service.ts
        competition-leaderboard.service.ts
        competition-timer.service.ts

    controllers/
        competition.controller.ts

    gateways/
        competition.gateway.ts

    guards/
        competition-participant.guard.ts
        competition-admin.guard.ts
        competition-observer.guard.ts

    processors/
        competition.processor.ts

    validators/
        competition-job.validator.ts

    tests/
```

Persistence lives in Prisma, not TypeORM entities:

```text
prisma/schema.prisma
prisma/migrations/
prisma.config.ts
src/generated/prisma/          # Prisma 7 generated client
src/prisma/prisma.module.ts    # nest g module prisma
src/prisma/prisma.service.ts   # nest g service prisma --flat
```

## 3.2 Initialize Prisma 7 + PostgreSQL with the CLI

If a database layer is required — and this feature requires one — use **Prisma 7** with **PostgreSQL**. Do not introduce TypeORM, Sequelize, or a second ORM.

```bash
npm install -D prisma@^7 dotenv
npm install @prisma/client@^7 @prisma/adapter-pg pg

npx prisma init --datasource-provider postgresql --output ../src/generated/prisma
```

That CLI must produce:

* `prisma/schema.prisma`
* `prisma.config.ts`
* `.env` with `DATABASE_URL`

Prisma 7 `prisma.config.ts` owns the datasource URL:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

`schema.prisma` must use the Prisma 7 client generator and PostgreSQL:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

Connection URL stays in `.env`:

```text
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/hirance?schema=public"
```

After editing models:

```bash
npx prisma migrate dev --name add_live_challenge
npx prisma generate
```

Load env with NestJS `ConfigModule.forRoot()`. Generate `PrismaService` with the Nest CLI, then wire the Prisma 7 PostgreSQL driver adapter:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

Export `PrismaService` from `PrismaModule` and import that module into `LiveChallengeModule`.

Do not instantiate `PrismaClient` without `@prisma/adapter-pg`. Do not use the legacy `prisma-client-js` generator. Do not put `url` on the `datasource` block when Prisma 7 expects it in `prisma.config.ts`.

On the Next.js side, keep UI isolated as well:

```text
app/competition/[id]/
    page.tsx                 # participant dashboard
    live/page.tsx            # observer / TV mode
components/competition/
    countdown.tsx
    score-card.tsx
    leaderboard.tsx
    observer-dashboard.tsx
lib/competition/
    api.ts
    socket.ts
    types.ts
```

Follow the existing Next.js routing convention (`app/` or `pages/`).

Do not implement job create/publish on this server. Mirror
external publishes into `Job` only for the scoring ledger.

---

# 4. Competition domain model

Create a Competition Prisma model.

Conceptually:

```text
Competition
-------------------------
id
name
description
status
duration_seconds
scheduled_start_at
actual_start_at
end_at
finalized_at
created_by
created_at
updated_at
```

Competition status:

```text
DRAFT
SCHEDULED
LIVE
ENDED
FINALIZED
CANCELLED
```

Persist statuses as Prisma enums in `prisma/schema.prisma` and share matching TypeScript enums with NestJS DTOs / services. Create and apply the models with `npx prisma migrate dev`. Do not add TypeORM entities.

---

# 5. Competition participant

Create:

```text
CompetitionParticipant
-------------------------
id
competition
user
company
status
joined_at
last_heartbeat_at
completed_at
final_score
final_rank
created_at
updated_at
```

Participant status:

```text
REGISTERED
READY
ACTIVE
DISCONNECTED
FINISHED
DISQUALIFIED
```

Use the existing CompanyMembership model to determine the participant's company where applicable.

Do not duplicate company membership logic.

---

# 6. Competition jobs

Do NOT create a separate Job model.

Reuse the existing Job model.

Add a nullable relation on the existing Prisma `Job` model:

```prisma
model Job {
  // ...existing fields
  competition   Competition? @relation(fields: [competitionId], references: [id])
  competitionId String?
}

model Competition {
  id   String @id @default(uuid())
  jobs Job[]
  // ...
}
```

Apply it with `npx prisma migrate dev --name job_competition_relation`. If Job already supports equivalent metadata, reuse that instead of adding a second field.

Normal jobs:

```text
competition = NULL
```

Competition jobs:

```text
competition = <competition>
```

This allows the normal Hirance Job system to remain the source of truth.

---

# 7. What counts as a score

The score must mean:

```text
number of successfully published valid competition jobs
```

It must NOT mean:

```text
number of POST requests
number of drafts
number of created objects
number of publish attempts
number of frontend counter increments
```

Example:

```text
Draft created             -> +0
Validation failed         -> +0
Publish failed            -> +0
Job saved as draft        -> +0
Job successfully published -> +1
```

---

# 8. Single source of truth for scoring

The actual Job records are the source of truth.

A valid score is conceptually:

```text
COUNT(
    jobs
    WHERE competition_id = X
    AND created_by = participant
    AND status = PUBLISHED
    AND published_at IS NOT NULL
)
```

You may maintain a denormalized/cached participant counter for high-performance leaderboard reads, but it must never become an independent source of truth.

If a cached counter exists:

* update it transactionally
* make increments idempotent
* reconcile against Jobs when required
* provide an administrative consistency check

Never trust a client-provided score.

---

# 9. Competition-specific job rules

During the competition, jobs must satisfy the normal Hirance job validation rules.

Additionally, competition-specific rules may be applied.

Make these configurable where practical:

```text
required title
required description
required location
required employment type
required skills
minimum description length
```

Do not weaken normal production Job validation merely for the competition.

Implement extra rules in NestJS validators / pipes / a dedicated competition-job validator that runs beside the existing Job validation.

---

# 10. Competition lifecycle

Implement:

```text
DRAFT
   ↓
SCHEDULED
   ↓
LIVE
   ↓
ENDED
   ↓
FINALIZED
```

Only authorized competition administrators can transition states.

Prevent invalid transitions.

For example:

```text
DRAFT → FINALIZED       ❌
FINALIZED → LIVE        ❌
LIVE → SCHEDULED        ❌
```

unless an explicit administrative operation is intentionally supported.

---

# 11. Server-authoritative timer

The timer is critical.

Never trust:

```ts
Date.now()
```

on the Next.js client as the competition authority.

The NestJS server must define:

```text
actual_start_at
end_at
duration_seconds
```

The client should receive:

```json
{
  "server_time": "...",
  "start_at": "...",
  "end_at": "..."
}
```

The Next.js client calculates the visual countdown from server time.

NestJS must independently validate whether the competition is active on every publish and state-changing request.

---

# 12. Competition start

When the competition starts:

1. Set `actual_start_at`.
2. Calculate `end_at`.
3. Set status to `LIVE`.
4. Notify all participants.
5. Broadcast `COMPETITION_STARTED` through the NestJS WebSocket gateway.
6. Start required background/finalization job (BullMQ / existing queue).
7. Make job publishing competition-aware.

Do not depend solely on a queued worker to determine whether the competition is over.

The NestJS API must always check the authoritative timestamps.

---

# 13. Competition end

At `end_at`:

1. Stop accepting new competition job publications.
2. Mark competition as `ENDED`.
3. Stop score changes.
4. Calculate final scores.
5. Calculate final ranking.
6. Resolve ties according to a documented rule.
7. Store final result.
8. Broadcast `COMPETITION_ENDED`.
9. Finalize the competition.
10. Notify participants.
11. Make the final leaderboard immutable.

Race conditions around the exact end time must be handled transactionally.

---

# 14. Exact end-time race condition

This is important.

Suppose:

```text
Competition ends at 15:05:00.000
```

and two publish requests arrive at:

```text
15:04:59.900
15:05:00.100
```

The NestJS backend must determine eligibility using server time and transaction-safe logic.

Never rely on the Next.js countdown.

Define and document the exact policy:

```text
published successfully before end_at = counts
published after end_at = does not count
```

Use database/server timestamps consistently.

---

# 15. Job publish integration

This competition server does **not** create or publish jobs.

Job creation lives on the separate Hirance job server. That server notifies
this API so scores and leaderboards update.

```text
External job server publishes a job
      ↓
POST /api/integrations/job-events  (HMAC)
      ↓
mirror Job (source = EXTERNAL)
      ↓
transactional score ledger
      ↓
real-time SCORE_UPDATED / LEADERBOARD_UPDATED
```

The score increases only after the ingest transaction commits.

---

# 15.1 External job server ingestion

Job creation happens on a separate Hirance job server. This competition
backend owns scoring, the timer, and the leaderboard.

Identity:

> **Competition-server attribution (implemented):** participants are
> companies identified by the main server's company UUID. Store
> `Company.id` + `Company.name`. Webhooks match on `company_id`
> (optional `company_name` refreshes display only). There is no
> `User.externalUserId` on this server.
>
> Scoring window: receive time must fall in
> `[actualStartAt, endAt + 3 seconds]`. Duration between successive
> scored webhooks is stored as `postDurationSeconds`.
>
> Historical monolith note (not used here): store a job-server user id
> on `User.externalUserId` and match webhooks by `external_user_id`.

Ingest:

```text
POST /api/integrations/job-events
```

Authenticate with HMAC-SHA256, not JWT:

```text
payload = `${x-hirance-timestamp}.${rawBody}`
signature = HMAC-SHA256(EXTERNAL_JOB_WEBHOOK_SECRET, payload)
```

Headers:

```text
x-hirance-timestamp   Unix seconds
x-hirance-signature   hex digest, optionally prefixed with sha256=
```

Reject timestamps outside `EXTERNAL_JOB_WEBHOOK_SKEW_SECONDS` (default 300).
Fail closed if the secret is missing.

Payload:

```json
{
  "event_id": "uuid",
  "event": "JOB_PUBLISHED",
  "company_id": "hirance-company-uuid",
  "company_name": "Acme Recruiting",
  "external_job_id": "hirance-job-987",
  "published_at": "2026-09-14T10:21:32.412Z",
  "job": {
    "title": "...",
    "description": "...",
    "location": "...",
    "employment_type": "FULL_TIME"
  }
}
```

Also accepted: `"event": "JOB_UNPUBLISHED"` for delete / unpublish upstream.

Resolution:

1. Look up `RoundParticipant` by `company_id` in a currently `LIVE` round.
2. Zero matches is a no-op (`no_live_round`). More than one is a soft
   no-op (`multiple_live_rounds`).
3. Eligibility uses **this backend's receive time** against
   `endAt + 3s`. `published_at` from the job server is audit-only.
4. Mirror the job into the `Job` table (`source = EXTERNAL`).
5. Increment score through the transactional `RoundJobScore` ledger.
6. Broadcast `SCORE_UPDATED` / `LEADERBOARD_UPDATED` only after commit.

Idempotency: `Job.externalJobId` is unique, and `RoundJobScore.jobId`
is unique. A retried webhook scores at most once.

Unpublish reverses the ledger (score floor 0) and archives the mirrored job.
Rejected once the competition is `FINALIZED`.

Response:

```json
{
  "scored": true,
  "my_score": 12,
  "competition_id": "uuid",
  "reason": null,
  "job_id": "uuid"
}
```

`reason` values include `unknown_external_user`, `no_live_competition`,
`already_scored`, `competition_ended`, `competition_finalized`.

There is no local `POST /jobs` create/publish path on this server.

---

# 16. Atomic scoring

The score update must be safe under concurrent requests.

Never do:

```ts
participant.score += 1;
await participantRepository.save(participant);
```

without proper transaction handling.

Avoid lost updates.

Use Prisma 7 database-safe atomic operations:

```text
prisma.$transaction(...)
prisma.competitionParticipant.update({
  data: { finalScore: { increment: 1 } }
})
interactive transactions with SELECT ... FOR UPDATE when required
unique constraints
idempotency keys
```

Example:

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.competitionParticipant.update({
    where: { id: participantId },
    data: { finalScore: { increment: 1 } },
  });
});
```

The exact implementation must be based on the existing data model.

---

# 17. Idempotency

A retry must not create duplicate score increments.

Example:

```text
Client publishes Job
       ↓
Server succeeds
       ↓
Network timeout
       ↓
Client retries
```

The retry must not produce:

```text
score +2
```

for one successful job.

The system should produce:

```text
score +1
```

only.

Use the Job's identity and/or an appropriate idempotency mechanism (NestJS interceptor / header such as `Idempotency-Key`, plus a unique database constraint on scored job IDs).

---

# 18. Real-time communication

Use the existing NestJS WebSocket / Socket.IO architecture.

Use WebSockets for:

* competition status
* timer synchronization
* score updates
* leaderboard updates
* participant presence
* job publication events
* rank changes
* connection state
* competition end

Do NOT stream screen video through NestJS WebSockets.

The Next.js client should subscribe through a dedicated client-side hook / provider. Real-time UI must be Client Components. Do not attempt to hold Socket.IO connections inside React Server Components.

---

# 19. WebSocket channels

Design rooms / channels conceptually as:

```text
competition:<competition_id>
```

for competition-wide updates.

Optional:

```text
competition:<competition_id>:participant:<participant_id>
```

for participant-specific events.

Authenticate the socket connection with the same NestJS auth strategy used by HTTP (JWT, cookie, etc.).

Permission-check every connection and every room join in the gateway.

A participant must not subscribe to another private participant channel.

Observers/admins require explicit permission.

---

# 20. WebSocket events

Define a consistent event contract.

Examples:

```text
COMPETITION_STARTED
COMPETITION_STATE
PARTICIPANT_JOINED
PARTICIPANT_CONNECTED
PARTICIPANT_DISCONNECTED
JOB_PUBLISHED
SCORE_UPDATED
LEADERBOARD_UPDATED
RANK_CHANGED
TIME_WARNING
COMPETITION_ENDED
COMPETITION_FINALIZED
```

Example:

```json
{
  "event": "SCORE_UPDATED",
  "competition_id": "uuid",
  "participant": {
    "id": "uuid",
    "name": "Rahul"
  },
  "score": 12,
  "previous_score": 11,
  "rank": 1,
  "progress": 80
}
```

Keep event contracts versionable and documented. Share TypeScript types between NestJS and Next.js if the monorepo already supports a shared package.

---

# 21. Leaderboard

Leaderboard ordering:

```text
1. score DESC — most scored jobs
2. score_reached_at ASC — earlier time of reaching that score
3. created_at ASC — deterministic final tie-break
```

For example:

```text
A = 25 jobs at 04:35
B = 25 jobs at 04:42
C = 25 jobs at 04:50
D = 24 jobs at 04:55
→ A, B, C, then D
```

Do not allow frontend sorting to determine the official ranking.

---

# 22. Leaderboard performance

Do not execute expensive queries for every WebSocket client independently.

Create an efficient leaderboard service in NestJS.

For a small competition:

```text
PostgreSQL query
+
Redis cache
```

is sufficient.

If participant counts become large, optimize further.

Use:

* indexed competition_id
* participant_id
* job status
* published_at
* appropriate composite indexes

Inspect actual query plans before adding unnecessary indexes.

---

# 23. Redis usage

Redis can be used for:

* WebSocket / Socket.IO adapter fan-out (required for multi-instance NestJS)
* presence
* heartbeat
* ephemeral competition state
* leaderboard cache
* short-lived locks where genuinely required
* pub/sub
* BullMQ backing store

Do not use Redis as the permanent source of truth.

PostgreSQL remains authoritative.

If the API runs more than one NestJS instance, use the Redis Socket.IO adapter so broadcasts reach every connected Next.js client.

---

# 24. Queue / worker usage

Use BullMQ (or the existing NestJS queue) for asynchronous work such as:

```text
competition finalization
result generation
notifications
analytics
cleanup
reconciliation
```

Do not use a background job as the only mechanism that determines whether a job can be published.

The NestJS HTTP API must enforce the competition time window itself.

---

# 25. Participant UI

Build a dedicated Next.js competition page.

Example route:

```text
/competition/[id]
```

Home (`/`) resolves the singleton competition via
`GET /api/competitions/current` and redirects here.

After mobile + PIN join, the participant UI is
**screen share only**. Do not show score, rank, timer,
leaderboard, or job creation on this page. Those live on
the TV / admin surfaces and the external job server.

Example:

```text
┌─────────────────────────────────────────────┐
│ HIRANCE LIVE CHALLENGE                      │
│ Acme Recruiting          Round 1 · LIVE     │
│                                             │
│            [ START SCREEN SHARE ]           │
│                                             │
│ Waiting / DQ / not-in-round banners only    │
└─────────────────────────────────────────────┘
```

---

# 26. Job creation UI

Job create / publish lives on the **external Hirance job
server**, not in this Next.js app. Do not build a
competition-local job form on the participant page.

Wire the job server to:

1. Admin REST (`x-admin-key`) for competition / rounds /
   roster / start / end — see
   `docs/JOB_SERVER_INTEGRATION.md`
2. HMAC webhook `POST /api/integrations/job-events` on
   successful publish

TV / admin Client Components subscribed to the NestJS
gateway show live score / rank / timer.

---

# 27. Live observer dashboard

Create a dedicated Next.js observer/admin screen.

Primary purpose:

> Display the competition on a large screen/TV and make the competition feel live.

Example:

```text
┌──────────────────────────────────────────────────────────────┐
│ 🏆 HIRANCE LIVE JOB CHALLENGE             🔴 LIVE   04:32    │
│                                                              │
│ Create and publish as many jobs as possible                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ 🥇 Rahul             🥈 Priya             🥉 Amit             │
│                                                              │
│     12                   10                   9               │
│     JOBS                 JOBS                 JOBS            │
│                                                              │
│ ████████████████      █████████████       ████████████       │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ LIVE RANKING                                                 │
│                                                              │
│ 🥇 Rahul       12                                           │
│ 🥈 Priya       10                                           │
│ 🥉 Amit         9                                           │
│ 4  Neha         8                                           │
│ 5  Arjun        7                                           │
│                                                              │
│                     ⏱ 04:32 REMAINING                       │
└──────────────────────────────────────────────────────────────┘
```

---

# 28. Ranking animations

When the score changes:

```text
Rahul
11 → 12
```

show:

```text
+1 JOB 🚀
```

If rank changes:

```text
#3 → #2
```

animate the leaderboard position.

Animations must not affect functionality or accessibility.

---

# 29. Full-screen / TV mode

Provide:

```text
/competition/[id]/live
```

with a presentation mode.

Requirements:

* large typography
* high contrast
* minimal controls
* auto-refresh via WebSocket
* browser full-screen support
* readable from distance
* responsive to 16:9 displays
* no unnecessary admin controls

---

# 30. Optional screen sharing

Screen sharing should be treated as a separate feature from competition scoring.

If required, use:

**WebRTC** for screen streaming.

Do NOT send video frames through NestJS WebSockets.

Architecture:

```text
Candidate Browser
      │
      │ WebRTC
      ▼
     SFU
      │
      ├───────────────┐
      ▼               ▼
Observer 1        Observer 2
```

Use an SFU/media infrastructure rather than making NestJS act as a media server.

Possible technology options should be evaluated based on deployment complexity and expected scale.

Prefer a managed WebRTC/SFU solution initially if it materially reduces operational complexity.

NestJS may mint short-lived signaling / join credentials. Next.js only hosts the participant and observer WebRTC clients.

---

# 31. Screen-sharing modes

Support:

### Grid mode

```text
┌──────────┬──────────┬──────────┬──────────┐
│ Rahul    │ Priya    │ Amit     │ Neha     │
│ SCREEN   │ SCREEN   │ SCREEN   │ SCREEN   │
│ 12 jobs  │ 10 jobs  │ 9 jobs   │ 8 jobs   │
└──────────┴──────────┴──────────┴──────────┘
```

### Focus mode

Click participant:

```text
┌──────────────────────────────────────────┐
│ Rahul • #1 • 12 jobs                     │
│                                          │
│             LIVE SCREEN                  │
│                                          │
│ Score: 12                                │
│ Rank: #1                                 │
└──────────────────────────────────────────┘
```

For scalability:

* use lower resolution for grid thumbnails
* use higher quality for selected participant
* do not unnecessarily stream high-resolution video to every observer

---

# 32. Screen-sharing permissions

Explicitly obtain browser screen-share permission.

Do not attempt to bypass browser security.

The participant should clearly understand:

```text
Your screen is being shared with competition observers.
```

Handle:

* permission denied
* user stops sharing
* browser closes
* connection lost
* reconnect
* screen-sharing restart

Screen sharing should not automatically determine the score.

---

# 33. Presence and heartbeat

Implement participant heartbeat.

Example:

```text
heartbeat every 10–15 seconds
```

Store ephemeral presence in Redis where appropriate.

Persist important lifecycle events in PostgreSQL.

Statuses:

```text
CONNECTED
DISCONNECTED
RECONNECTED
```

A disconnected candidate should not automatically lose already published jobs.

Their score remains based on successfully published jobs.

---

# 34. Reconnection

If a participant loses internet:

```text
disconnect
    ↓
reconnect
    ↓
authenticate
    ↓
restore competition state
    ↓
restore current score
    ↓
restore current rank
    ↓
resynchronize timer
```

Never reset the timer based on reconnection.

Never reset the score.

The Next.js client must re-fetch HTTP snapshot state after socket reconnect, then resume live events.

---

# 35. Anti-cheating / abuse controls

At minimum:

* server-authoritative timer
* server-authoritative score
* NestJS guards on HTTP and WebSocket
* competition membership validation
* competition status validation
* job validation
* publish validation
* idempotency
* audit logging
* rate limiting
* duplicate prevention
* immutable final results

Optionally track:

```text
tab visibility
browser focus
screen sharing state
disconnect/reconnect
heartbeat
publish timestamps
job creation timestamps
```

Do not rely on browser-side anti-cheat controls as authoritative evidence.

---

# 36. Competition audit events

Create an audit/event model if an existing audit system cannot be reused.

Example:

```text
CompetitionEvent
-------------------------
id
competition
participant
event_type
metadata
created_at
```

Events:

```text
JOINED
STARTED
JOB_CREATED
JOB_PUBLISHED
PUBLISH_FAILED
DISCONNECTED
RECONNECTED
SCREEN_SHARE_STARTED
SCREEN_SHARE_STOPPED
DISQUALIFIED
COMPETITION_ENDED
```

Store enough information to investigate disputes.

Do not store sensitive data unnecessarily.

---

# 37. Security

Enforce with NestJS guards, policies, and service-level checks:

### Participant

Can:

* join the active round with mobile + shared PIN
* screen-share while the round is LIVE (LiveKit)

Cannot:

* view or modify score
* view or modify rank
* modify competition timing
* create / publish jobs in this app (job server only)
* access another participant's private information
* access observer/admin operations

### Observer

Can:

* view competition
* view leaderboard
* view permitted participant information
* view screens if authorized

Cannot:

* publish jobs
* modify score
* modify competition state

### Competition Admin

Can:

* create competition
* schedule competition
* register participants
* start
* cancel
* end
* finalize
* inspect audit events
* view results

Use existing NestJS auth, company-membership checks, and role/permission guards wherever applicable.

Next.js pages must hide unauthorized UI, but hiding UI is not authorization. NestJS remains the authority.

---

# 38. API design

Design clean NestJS REST endpoints such as:

```text
POST   /competitions/
GET    /competitions/:id/
POST   /competitions/:id/join/
POST   /competitions/:id/start/
POST   /competitions/:id/end/
POST   /competitions/:id/finalize/

GET    /competitions/:id/leaderboard/
GET    /competitions/:id/participants/
GET    /competitions/:id/events/

GET    /competitions/:id/me/
```

Do not blindly implement these exact URLs if the project has an existing URL convention.

Follow existing NestJS global prefix, versioning, and DTO conventions (`ValidationPipe`, class-validator, existing response interceptor / envelope).

Next.js should call these NestJS endpoints through the existing API client. Do not re-implement them as Next.js Route Handlers.

---

# 39. Competition-aware Job API

Prefer integrating competition context into the existing Job APIs rather than creating duplicate job APIs.

When jobs are created on the external job server, that server calls
`POST /api/integrations/job-events` with the participant's
`external_user_id` on join/register. See section 15.1.

For example:

```json
{
  "title": "...",
  "competition_id": "..."
}
```

or determine competition context from the authenticated participant/session where appropriate.

Do not allow a participant to submit an arbitrary competition ID belonging to another competition.

Validate server-side:

```text
authenticated user
+
registered participant
+
competition LIVE
+
competition belongs to current participant
```

---

# 40. Score API response

Example:

```json
{
  "competition_id": "uuid",
  "status": "LIVE",
  "time_remaining_seconds": 272,
  "my_score": 12,
  "my_rank": 2,
  "total_participants": 20
}
```

Leaderboard:

```json
{
  "competition_id": "uuid",
  "status": "LIVE",
  "participants": [
    {
      "rank": 1,
      "user_id": "uuid",
      "name": "Rahul",
      "score": 13
    },
    {
      "rank": 2,
      "user_id": "uuid",
      "name": "Priya",
      "score": 12
    }
  ]
}
```

Use the project's existing response envelope conventions.

---

# 41. Database indexes

Inspect actual query patterns and add only useful indexes.

Likely candidates:

```text
Competition.status
Competition.scheduled_start_at
Competition.end_at

CompetitionParticipant.competition_id
CompetitionParticipant.user_id

Job.competition_id
Job.competition_id + status
Job.competition_id + created_by
Job.competition_id + published_at
```

Use composite indexes where they materially improve the actual queries.

Avoid redundant indexes.

Use PostgreSQL `EXPLAIN ANALYZE` during performance testing.

---

# 42. Database constraints

Use database constraints for invariants where possible.

Examples:

* participant uniqueness per competition
* valid relationships
* appropriate nullable rules
* valid status values
* unique competition/job relationship where applicable

Do not rely only on DTO / class-validator checks.

---

# 43. Transaction boundaries

Publishing a competition job must be transaction-safe.

Conceptually:

```text
BEGIN

validate competition
validate participant
validate job
publish job
record competition event
update/reconcile score

COMMIT
```

Broadcast real-time events only after the transaction is successfully committed.

Never broadcast:

```text
SCORE = 12
```

before the database transaction is confirmed.

Use after-commit hooks / emit-after-transaction patterns in the NestJS service. Do not emit from inside an uncommitted transaction.

---

# 44. Notifications

At minimum:

```text
Competition scheduled
Competition starting soon
Competition started
Competition ended
Results finalized
Winner announced
```

Reuse the existing NestJS notification/email infrastructure instead of implementing a second email system.

---

# 45. Admin

Add admin support for:

```text
Competition
CompetitionParticipant
CompetitionEvent
```

Use the existing admin approach in this project:

* existing NestJS admin module, or
* existing Next.js admin UI talking to NestJS admin endpoints

Admin should provide:

* filtering
* searching
* status
* dates
* participants
* final scores
* final ranks
* audit history

Do not allow dangerous direct modifications that could invalidate a live competition without explicit safeguards.

Do not invent a Django-style admin if the project already has a Next.js admin surface.

---

# 46. Observability

Add structured logging around:

```text
competition_id
participant_id
job_id
event
status
duration
```

Important logs:

```text
competition started
participant joined
job publish success
job publish failure
score updated
leaderboard updated
participant disconnected
competition ended
competition finalized
```

Monitor:

* WebSocket connections
* publish requests
* publish failures
* competition events/sec
* Redis usage
* database query latency
* leaderboard latency
* WebRTC/SFU metrics if implemented
* BullMQ / worker task failures
* Next.js client reconnect rate

Integrate with the project's existing monitoring/Datadog setup if present.

---

# 47. Rate limiting

Protect job APIs and competition endpoints against abuse.

However, do not configure a rate limit that prevents legitimate competition activity.

The challenge is intentionally high-frequency.

Use NestJS throttling / competition-specific limits where required.

Example:

```text
publish attempts per participant
requests per second
WebSocket connection attempts
```

The exact limits should be configurable.

---

# 48. Performance target

The competition must support real-time updates without causing excessive database load.

Optimize for:

```text
5-minute competition
10–100 participants initially
many simultaneous publish requests
real-time leaderboard
multiple observers
```

Design so that it can scale beyond this without changing the domain model.

Do not query the entire Job table every time a participant publishes.

---

# 49. Live leaderboard strategy

Prefer:

```text
PostgreSQL
    ↓
authoritative state

Redis
    ↓
short-lived leaderboard/realtime state

NestJS WebSocket gateway
    ↓
broadcast updates to Next.js clients
```

Do not make every observer repeatedly call:

```text
GET /leaderboard/
```

after every score change.

Use WebSocket push.

Use HTTP as the initial state/recovery mechanism.

Therefore:

```text
HTTP → initial state
WebSocket → live updates
HTTP → recovery/resync
```

---

# 50. WebSocket recovery

If the client misses events:

```text
WebSocket reconnect
       ↓
GET current competition state
       ↓
GET current leaderboard
       ↓
resume WebSocket
```

The system must not depend on receiving every event in sequence.

The current database state must always be recoverable.

---

# 51. Final result

At the end:

```text
Competition
    ↓
Final score calculation
    ↓
Deterministic ranking
    ↓
Winner
```

Store final results.

Example:

```text
🥇 A    25 jobs  (reached at 04:35)
🥈 B    25 jobs  (reached at 04:42)
🥉 C    25 jobs  (reached at 04:50)
   D    24 jobs
```

After finalization:

* scores cannot change
* leaderboard cannot change
* winner cannot change
* job publication for that competition is rejected

unless an explicit administrative correction workflow exists.

---

# 52. Tie handling

Implement a deterministic ranking strategy.

```text
Highest published job count
        ↓
If tied on count:
earlier scoreReachedAt (webhook receive time) wins
```

Example:

```text
A  25 jobs at 04:35  → wins
B  25 jobs at 04:42  → second
C  25 jobs at 04:50  → third
D  24 jobs at 04:55  → fourth
```

Unpublish reverses the ledger and recomputes `scoreReachedAt` from remaining scored jobs.

Document the rule in the admin UI. Admin shows score + time reached / last webhook; participant UI stays screen-share only.

---

# 53. Testing requirements

Write comprehensive tests.

### NestJS unit / entity tests

* competition states
* participant uniqueness
* job relationship
* constraints

### NestJS service tests

* start competition
* end competition
* join competition
* publish job
* score update
* ranking
* finalization

### Security tests

* unauthorized participant
* unauthorized observer
* wrong competition
* expired competition
* modified competition ID
* score manipulation
* rank manipulation
* WebSocket join without permission

### Concurrency tests

Simulate:

```text
multiple participants publishing simultaneously
same participant publishing simultaneously
publish exactly at end_at
retry after timeout
duplicate request
WebSocket reconnect
```

### API tests

All NestJS endpoints (supertest / existing e2e setup).

### WebSocket tests

* connect
* authenticate
* permission
* score event
* leaderboard event
* disconnect
* reconnect
* competition end

### Next.js tests

* countdown
* score update
* ranking update
* reconnect
* final state
* participant page
* observer / live page

Use the project's existing test stack (typically Jest on NestJS; Jest / Playwright / Testing Library on Next.js).

---

# 54. Load testing

Create a dedicated load-test scenario.

Test:

```text
100 participants
multiple simultaneous job publications
multiple observer WebSockets
5-minute competition
```

Measure:

```text
HTTP p50/p95/p99
WebSocket latency
database CPU
database connections
Redis CPU/memory
event propagation latency
leaderboard update latency
```

The goal is that when:

```text
Participant publishes job
```

the observer screen updates within a small, predictable real-time latency.

---

# 55. Failure scenarios

Explicitly test:

```text
PostgreSQL temporarily unavailable
Redis unavailable
BullMQ / worker unavailable
participant disconnects
observer disconnects
candidate refreshes browser
candidate opens multiple tabs
candidate retries publish
API timeout
WebSocket reconnect
server restart
Next.js client hydration / remount
competition ends while request is processing
```

The system must fail safely.

Most importantly:

> A Redis/WebSocket failure must never corrupt the authoritative competition score.

---

# 56. Multiple browser tabs

Prevent or safely handle:

```text
same participant
→ multiple active competition sessions
```

Choose a deliberate policy.

Recommended:

```text
one active competition session per participant
```

or allow multiple sessions but ensure they cannot produce duplicate scoring or bypass limits.

Do not rely only on frontend localStorage or Next.js client state.

Enforce server-side in NestJS.

---

# 57. Security around screen sharing

If screen sharing is implemented:

* explicit permission
* authenticated participants
* authorized observers only
* no public stream URLs
* short-lived access credentials
* revoke access when competition ends
* stop/reject streams after disqualification
* never expose candidate private information unnecessarily

---

# 58. UI states

Handle all states in Next.js:

```text
Competition not started
Registration
Ready
Starting
Live
Less than 60 seconds
Competition ended
Finalizing
Results
Cancelled
Disqualified
Disconnected
Reconnecting
Screen share unavailable
```

Do not leave the UI in an ambiguous state.

---

# 59. Final live screen

The presentation screen should emphasize:

```text
TIME REMAINING
+
TOP 3
+
LIVE JOB COUNTS
+
LIVE RANKING
```

Example:

```text
┌───────────────────────────────────────────────┐
│              🏆 HIRANCE                       │
│       5-MINUTE JOB CHALLENGE                  │
│                                               │
│                 02:17                         │
│                                               │
│     🥇 Rahul       🥈 Priya       🥉 Amit     │
│          17              15            14     │
│                                               │
│     ████████████████                         │
│                                               │
│ LIVE RANKING                                  │
│                                               │
│ 1  Rahul       17                             │
│ 2  Priya       15                             │
│ 3  Amit        14                             │
│ 4  Neha        13                             │
│ 5  Arjun       12                             │
│                                               │
└───────────────────────────────────────────────┘
```

At the final 30 seconds, make the timer visually prominent.

At zero:

```text
🏁 TIME'S UP
```

Then transition to:

```text
FINAL RESULTS
```

---

# 60. Final implementation sequence

Do NOT implement everything simultaneously.

Implement in this order:

### Phase 1 — Domain (NestJS + Prisma 7)

* `nest g` module / resource / services / guards
* `npx prisma init` if Prisma is not already present
* Prisma 7 models: Competition, CompetitionParticipant, CompetitionEvent
* nullable Job.competition relation
* `npx prisma migrate dev` + `npx prisma generate`
* PrismaService via Nest CLI + `@prisma/adapter-pg`
* Competition lifecycle
* guards / permissions
* admin endpoints / admin UI hooks

### Phase 2 — Competition job flow (NestJS)

* join
* start
* competition-aware job creation
* successful publication
* atomic score
* finalization

### Phase 3 — Real-time (NestJS + Next.js client socket)

* WebSocket authentication
* competition room
* score events
* leaderboard events
* presence
* reconnect
* timer synchronization

### Phase 4 — Participant UI (Next.js)

* competition page (singleton via `/competitions/current`)
* mobile + PIN join
* screen share controls (LiveKit)
* waiting / not-in-round / DQ banners only
* no score / rank / timer / leaderboard on participant page

### Phase 5 — Observer UI (Next.js)

* live leaderboard
* top 3
* live animations
* presentation/full-screen mode

### Phase 6 — Audit/security

* events
* rate limits
* idempotency
* anti-abuse
* audit logs

### Phase 7 — Optional screen sharing

* WebRTC
* SFU
* screen-share permissions
* grid mode
* focus mode

### Phase 8 — Production hardening

* load tests
* failure tests
* monitoring
* alerts
* database optimization
* Redis optimization
* WebSocket capacity testing

---

# 61. Important implementation rules

Do NOT:

* trust frontend score
* trust frontend timer
* count job creation as a score
* increment score before successful publish
* increment score from WebSocket messages
* use Redis as the permanent score source
* stream video through NestJS WebSockets
* create a duplicate Job model
* duplicate existing Job publishing logic
* allow arbitrary competition IDs
* allow score/rank updates from clients
* depend exclusively on BullMQ / workers for competition expiration
* broadcast database state before transaction commit
* allow retries to double-count a job
* put scoring, timer authority, or publish rules in Next.js Route Handlers
* hold Socket.IO connections in React Server Components
* hand-roll NestJS modules, controllers, services, gateways, or guards when `nest g` can create them
* introduce TypeORM, Sequelize, or a second ORM
* instantiate Prisma Client without the Prisma 7 `pg` driver adapter

Always:

* generate NestJS components with the Nest CLI
* use Prisma 7 + PostgreSQL, initialized and migrated with the Prisma CLI
* use server time in NestJS
* use PostgreSQL as authoritative state
* use transactions
* use idempotency
* validate permissions in NestJS guards and services
* use WebSockets for live state propagation
* use Redis for ephemeral/realtime workloads
* use BullMQ / existing workers for asynchronous processing
* reuse existing Hirance domain logic
* keep APIs backward-compatible
* add proper indexes
* test concurrency
* test exact end-time behavior
* make final results immutable
* share TypeScript types where the monorepo already supports it

---

# 62. Deliverables

Implement the complete feature and provide:

1. Prisma 7 schema + PostgreSQL models
2. Prisma migrations (`npx prisma migrate dev`) and generated client
3. NestJS services generated with `nest g`
4. PrismaService (Nest CLI + `@prisma/adapter-pg`)
5. DTOs + validation generated with `nest g class`
6. NestJS REST APIs (`nest g resource` / controller)
7. NestJS WebSocket gateway (`nest g gateway`)
8. Redis integration (including Socket.IO adapter if multi-instance)
9. BullMQ / worker processors
10. Guards / permissions (`nest g guard`)
11. Admin UI or admin endpoints
12. Next.js participant UI
13. Next.js observer/live dashboard
14. Full-screen presentation mode
15. Optional WebRTC screen sharing
16. Audit events
17. Logging
18. Tests (NestJS + Next.js)
19. Load-test scenario
20. Documentation
21. Deployment/configuration requirements
22. Environment variables (`DATABASE_URL`, etc.)
23. API documentation
24. WebSocket event documentation
25. Architecture diagram

---

# 63. Final acceptance criteria

The implementation is complete only when this complete scenario works:

```text
Admin creates competition
        ↓
Adds 20 HR/founder participants
        ↓
Schedules 5-minute competition
        ↓
Participants join
        ↓
Competition starts
        ↓
All Next.js clients receive synchronized timer
        ↓
Participant creates Job #1
        ↓
Job successfully publishes
        ↓
Score becomes 1
        ↓
All observers receive real-time update
        ↓
Participant creates Job #2
        ↓
Score becomes 2
        ↓
Leaderboard updates
        ↓
Rank changes are reflected
        ↓
Multiple participants publish simultaneously
        ↓
No score corruption
        ↓
Participant disconnects
        ↓
Participant reconnects
        ↓
Score/timer/rank recover correctly
        ↓
Competition reaches end_at
        ↓
New publishes are rejected
        ↓
Final scores calculated
        ↓
Tie-break applied
        ↓
Leaderboard frozen
        ↓
Winner determined
        ↓
Final results displayed
        ↓
Audit trail available
```

The final implementation must be production-ready, secure, transaction-safe, scalable, observable, and maintainable.

Before making large architectural changes, inspect the existing Hirance NestJS and Next.js codebase and reuse existing functionality wherever possible.
