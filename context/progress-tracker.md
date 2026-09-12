# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Specification aligned. Implementation not started.

## Current Goal

- Inspect the existing Hirance NestJS + Next.js codebase
  and produce a short architecture assessment before
  Phase 1 domain work.

## Completed

- Rewrote `details.md` from Django/DRF/Celery to
  NestJS + Next.js + BullMQ + Socket.IO.
- Filled `CLAUDE.md` and all `context/` files for this
  stack and feature.

## In Progress

- None yet.

## Next Up

- Inspect existing User, Employer, Company,
  CompanyMembership, Job, auth, guards, Redis, queue,
  WebSocket, ORM, notifications, and Next.js job UI.
- Phase 1 — Domain: Competition, Participant, lifecycle,
  Job relation, permissions, admin hooks.

## Open Questions

- Confirm the existing ORM (TypeORM vs Prisma vs other).
- Confirm the existing queue (BullMQ vs other NestJS
  worker).
- Confirm auth strategy for HTTP and Socket.IO (JWT,
  cookie, Passport).
- Confirm Next.js router (`app/` vs `pages/`) and the
  existing job creation component path.
- Confirm monorepo layout (`apps/api` + `apps/web` vs
  separate repos).
- Confirm whether an admin UI already exists in Next.js
  or as a NestJS admin module.
- Confirm whether WebRTC screen sharing is required for
  the first production release (Phase 7 is optional).

## Architecture Decisions

- NestJS owns scoring, timer, authorization, and publish
  rules. Next.js is UI only.
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
- Do not reintroduce Django, Celery, or Django Admin.
