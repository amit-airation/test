# Hirance Live Job Creation Competition

## Overview

Hirance Live Job Creation Competition is a production-grade
real-time scoring and leaderboard server for HRs, founders,
and employers. There is **one competition** with multiple
sequential rounds. Each company participant gets a fixed
round window — initially 5 minutes — to publish as many
valid jobs as possible on the external Hirance job server.
The winner is the company with the highest number of
successfully published jobs when the round ends. If tied,
earlier `scoreReachedAt` (webhook receive time) ranks higher.

Drafts, failed validation, failed publishes, deleted jobs,
and incomplete jobs never increase the score.

This server does **not** host login/JWT accounts or job CRUD.
Identity is `companyId` + `companyName` (+ unique `mobile`
for closed-roster join). Scoring is via signed webhooks only.

Participants only join (mobile + PIN) and **screen-share**.
Scores, timer, leaderboard, rounds, and roster are owned by
the admin UI and the job server.

## Goals

1. Run timed, server-authoritative competition rounds
   without trusting client clocks or client scores.
2. Count only successfully published, valid competition
   jobs, with concurrency-safe and idempotent scoring.
3. Push live score, rank, timer, and leaderboard updates
   to observer / TV screens (not the participant UI).
4. Display company names on leaderboard / roster. Job
   create/publish lives on the external Hirance job server;
   this API scores via webhook matched by `company_id`.

## Core User Flow

1. Admin or job server creates the **singleton** competition
   once (`x-admin-key` or Next.js `/admin`), then creates
   rounds.
2. Admin / job server registers companies per round with
   `companyId`, `companyName`, and `mobile`. Participants
   join with mobile + shared join PIN (`x-event-key`).
3. Admin / job server starts a round. NestJS sets
   `actualStartAt` / `endAt`, sets `activeRoundId`, and
   broadcasts `ROUND_STARTED` / `ACTIVE_ROUND_CHANGED`.
4. Participant UI unlocks LiveKit screen share while the
   round is LIVE. TV / admin receive synchronized timer and
   scores from server time.
5. A company publishes a job on the external job server.
6. That server POSTs a signed event to
   `/api/integrations/job-events` with `company_id`
   (optional `company_name` for display refresh). After
   the ingest transaction commits, score increments by 1
   if receive time is within `[actualStartAt, endAt + 3s]`.
7. Participants may disconnect and reconnect without
   resetting timer or score (authoritative on the API).
8. After `endAt + 3s`, new publishes are not scored.
   Ranking uses score DESC then `scoreReachedAt` ASC.
   Winner and ranks are stored on finalize; the
   leaderboard becomes immutable.

## Features

### Competition management

- One competition; many sequential rounds
- Draft, schedule, start, end, finalize, and cancel rounds
- Per-round participant registration / join
- Server-authoritative timer per round
- Winner determination and immutable final results

### Scoring and jobs

- Mirrored `Job` records from external webhooks
- Score = count of successfully published valid jobs
  in the round ledger (`RoundJobScore`)
- Atomic, idempotent score updates
- `postDurationSeconds` = time since previous scored job
- `scoreReachedAt` = time of reaching current score (tie-break)
- Admin shows score + time reached / last webhook
- Single job-server webhook: `POST /api/integrations/job-events`

### Real-time

- NestJS WebSocket / Socket.IO gateway
- Live score, rank, leaderboard, presence, and end events
  for TV / admin
- HTTP snapshot for initial load and reconnect recovery

### Dashboards

- Next.js participant page (join + screen share only)
- Next.js observer / TV live dashboard (scores, timer,
  remote screens)
- Next.js `/admin` operator console
- LiveKit screen sharing (separate from scoring)

### Safety and operations

- Audit trail
- Key-based access (`ADMIN_KEY`, `EVENT_ACCESS_KEY`, HMAC)
- Rate limiting
- Observability and load-test scripts

## Scope

### In Scope

- NestJS competition module, APIs, guards, scoring,
  lifecycle, and WebSocket gateway
- Next.js participant (screen share), observer, and admin UI
- Prisma 7 + PostgreSQL models, CLI migrations, indexes,
  constraints
- Redis for ephemeral realtime state and Socket.IO
  fan-out
- BullMQ / existing workers for finalization where needed
- Audit events, logging, tests, API and event docs
- Job-server integration doc (`docs/JOB_SERVER_INTEGRATION.md`)

### Out of Scope

- Local job create / publish pipeline
- User login / JWT / Passport auth
- Participant score / rank / leaderboard UI
- Streaming video through NestJS WebSockets
- Treating Redis as the permanent score source
- Putting scoring, timer authority, or publish rules in
  Next.js Route Handlers
- Unrelated Hirance UI or architecture changes

## Success Criteria

1. A published competition job increments score by 1 only
   after the NestJS ingest transaction commits.
2. A publish after `endAt + 3s` is not scored.
3. Retries and duplicate requests do not double-count a
   job.
4. Disconnect / reconnect restores authoritative score,
   rank, and timer without reset.
5. Observer screens update in real time from WebSocket
   push, not polling after every score change.
6. After finalization, scores, ranks, and winner cannot
   change.
7. The full acceptance scenario in `details.md` section 63
   works end to end (with company_id attribution).
8. Participants see only join + screen share after login.
