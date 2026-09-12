# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Phase 0 complete — NestJS + Next.js monorepo
  initialized with Prisma 7, PostgreSQL, Redis, BullMQ.
- Next: Phase 1 — Domain (Competition models,
  lifecycle, guards, admin hooks).

## Current Goal

- Start Phase 1 domain work: `nest g` live-challenge
  module, Competition / CompetitionParticipant /
  CompetitionEvent Prisma models, nullable Job
  competition relation, lifecycle + permissions.

## Completed

- Rewrote `details.md` from Django/DRF/Celery to
  NestJS + Next.js + BullMQ + Socket.IO.
- Filled `CLAUDE.md` and all `context/` files for this
  stack and feature.
- Locked NestJS scaffolding to Nest CLI (`nest g`) and
  the database to Prisma 7 + PostgreSQL.
- Phase 0 — Project initialization:
  - npm workspaces monorepo: `apps/api` + `apps/web`
  - NestJS API (strict TS, `/api` prefix, port 3001)
  - Next.js App Router + Tailwind (port 3000)
  - Prisma 7 + PostgreSQL via `prisma.config.ts`,
    `@prisma/adapter-pg`, core User / Company /
    CompanyMembership / Job models, `init_core`
    migration
  - Redis + BullMQ + Throttler wired in Nest
  - Passport JWT packages installed (auth logic later)
  - Socket.IO server + client packages installed
  - `docker-compose.yml` for Postgres 16 + Redis 7
  - Verified `GET /api/health` and Next.js homepage

## In Progress

- None yet.

## Next Up

- Phase 1 — Domain via Nest CLI + Prisma 7:
  Competition, Participant, lifecycle, Job relation,
  permissions, admin hooks.

## Open Questions

- Confirm whether WebRTC screen sharing is required for
  the first production release (Phase 7 is optional).
- Confirm whether an admin UI should live in Next.js
  or as NestJS admin endpoints only for early phases.

## Architecture Decisions

- Monorepo layout: `apps/api` (NestJS) + `apps/web`
  (Next.js App Router). npm workspaces.
- NestJS owns scoring, timer, authorization, and publish
  rules. Next.js is UI only.
- NestJS modules, controllers, services, gateways,
  guards, and DTOs are created with `nest g`.
- Database is Prisma 7 + PostgreSQL. Initialize and
  migrate with Prisma CLI. Use `@prisma/adapter-pg`.
  Do not use TypeORM.
- Nest 12 scaffold is ESM (`"type": "module"`); Prisma
  client uses default ESM output (not `moduleFormat =
  "cjs"`).
- Auth strategy: Passport JWT (packages present; login
  flows in a later phase).
- Queue: BullMQ backed by Redis.
- Reuse the existing Job model with a nullable
  competition relation. No second Job model.
- PostgreSQL is the score source of truth. Redis is
  ephemeral realtime state.
- Score = successfully published valid competition jobs
  only, incremented after commit, idempotent on retry.
- Tie-break: score DESC, then earlier time of reaching
  that score ASC.
- Realtime: HTTP snapshot + Socket.IO push. No observer
  polling loop after every score change.
- Screen share, if built, uses WebRTC + SFU — never
  NestJS WebSockets for video.

## Session Notes

- `details.md` is the full spec (sections 1–63).
- Context files are the implementation contract for
  agents. Read them before coding.
- Do not reintroduce Django, Celery, Django Admin, or
  TypeORM.
- Prefer Nest CLI and Prisma 7 CLI for initialization.
- Phase 0 left competition domain out of scope by
  design.
