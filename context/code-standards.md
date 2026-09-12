# Code Standards

## General

- Inspect the existing Hirance NestJS and Next.js codebase
  before adding modules or UI.
- Reuse Job publish, auth, company membership, notifications,
  WebSockets, and the job creation form.
- Keep the competition module isolated from the normal
  Jobs / Applications domain. Orchestrate; do not duplicate.
- Preserve existing API response envelopes unless a new
  competition endpoint is required.
- Do not make unrelated UI or architecture changes.
- Fix root causes. Do not layer workarounds around scoring
  or timer bugs.
- SSOT, DRY, KISS, SOLID, ACID, YAGNI, least privilege,
  secure-by-default.

## TypeScript

- Strict TypeScript on both NestJS and Next.js.
- Avoid `any`. Share competition event and DTO types when
  the monorepo already has a shared package.
- Validate unknown input at NestJS boundaries with
  `ValidationPipe` and class-validator DTOs (or the
  existing validation style).
- Use TypeScript enums for competition and participant
  status, persisted the same way other enums are persisted.

## NestJS

- Create almost every NestJS artifact with the Nest CLI
  (`nest g module|resource|controller|service|gateway|guard|class|interceptor|pipe|filter`).
  Hand-write only the logic inside generated files.
- Put competition logic in a dedicated module such as
  `src/modules/live-challenge/`.
- Controllers stay thin. Services own lifecycle, scoring,
  and leaderboard.
- Guards enforce participant, observer, and admin access
  on HTTP and WebSocket.
- Reuse the existing Job service for create/publish.
  Add competition validation beside it, not a second
  publish pipeline.
- Use Prisma 7 transactions: `prisma.$transaction(...)`.
- Atomic score updates only: `increment`, row lock, unique
  constraints, idempotency keys. Never
  `participant.score += 1` then `save()`.
- Emit WebSocket events only after commit.
- BullMQ / existing queue for finalization, notifications,
  analytics, cleanup, reconciliation — not as the only
  clock that ends the competition.
- Follow existing global prefix, versioning, and error
  filter conventions.
- Suggested endpoints (adapt to existing URL style):

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

## Next.js

- Default to Server Components for static chrome.
- Add `"use client"` only for sockets, countdown, live
  leaderboard, and other browser interactivity.
- Do not implement competition scoring or publish rules
  in Route Handlers.
- Call NestJS through the existing API client.
- Reuse the existing job creation UI and pass
  `competition_id` or session-derived competition context.
- After socket reconnect: HTTP snapshot, then resume
  live events.
- Do not use `localStorage` as the authority for score,
  timer, or single-session policy.

## Styling

- Reuse Hirance tokens and components.
- No parallel design system for the competition.
- TV / live mode may scale type and spacing but must use
  the same tokens.

## Prisma 7 + PostgreSQL

- If a database is required, use Prisma 7 with PostgreSQL
  only. Do not add TypeORM or a second ORM.
- Initialize and evolve with CLI:

```bash
npx prisma init --datasource-provider postgresql --output ../src/generated/prisma
npx prisma migrate dev --name <change>
npx prisma generate
```

- Keep `DATABASE_URL` in `.env`. Put the URL in
  `prisma.config.ts` (`defineConfig` + `env("DATABASE_URL")`).
- Schema must use `provider = "prisma-client"` and
  `provider = "postgresql"`. Do not use legacy
  `prisma-client-js`.
- Generate `PrismaModule` / `PrismaService` with Nest CLI.
  Construct `PrismaClient` with `PrismaPg` from
  `@prisma/adapter-pg`.
- Load env through `ConfigModule.forRoot()`.
- PostgreSQL is authoritative for competitions,
  participants, jobs, scores, ranks, and audit events.
- Redis is ephemeral: presence, cache, pub/sub, Socket.IO
  adapter, queue backend.
- Add indexes only after inspecting query patterns.
  Likely: competition status and times; participant
  `(competition_id, user_id)`; job
  `(competition_id, status, created_by, published_at)`.
- Enforce participant uniqueness and scored-job
  uniqueness in the database, not only in DTOs.
- Do not store screen-share video in Postgres.

## File Organization

- `src/modules/live-challenge/` — NestJS competition
  module created with `nest g`
- `prisma/schema.prisma` — Prisma 7 models
- `prisma/migrations/` — Prisma CLI migrations
- `prisma.config.ts` — Prisma 7 datasource config
- `src/generated/prisma/` — generated Prisma Client
- `src/prisma/` — PrismaModule + PrismaService
- `dto/` — request/response validation (`nest g class`)
- `services/` — lifecycle, scoring, leaderboard, timer
- `gateways/` — Socket.IO rooms and events
- `guards/` — participant / observer / admin
- `processors/` — BullMQ / workers
- `app/competition/` — Next.js routes
- `components/competition/` — competition UI
- `lib/competition/` — API + socket + types
- `context/` — implementation specs for this feature
- `details.md` — full specification

## Testing

- NestJS: entity, service, guard, API (supertest),
  WebSocket, concurrency, exact `end_at` race, retry
  idempotency.
- Next.js: countdown, score/rank updates, reconnect,
  final state, participant and live pages.
- Use the existing Jest / Playwright / Testing Library
  setup.
- A Redis or WebSocket outage must not change stored
  scores.

## Observability

Log `competition_id`, `participant_id`, `job_id`, event,
status, and duration for start, join, publish success /
failure, score update, disconnect, end, and finalize.
Use the existing logger / Datadog setup if present.
