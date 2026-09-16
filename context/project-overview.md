# Hirance Live Job Creation Competition

## Overview

Hirance Live Job Creation Competition is a production-grade
real-time scoring and leaderboard server for HRs, founders,
and employers. Each company participant gets a fixed round
window — initially 5 minutes — to publish as many valid jobs
as possible on the external Hirance job server. The winner is
the company with the highest number of successfully published
jobs when the round ends.

Drafts, failed validation, failed publishes, deleted jobs,
and incomplete jobs never increase the score.

This server does **not** host login/JWT accounts or job CRUD.
Identity is `companyId` + `companyName`. Scoring is via signed
webhooks only.

## Goals

1. Run timed, server-authoritative competition rounds
   without trusting client clocks or client scores.
2. Count only successfully published, valid competition
   jobs, with concurrency-safe and idempotent scoring.
3. Push live score, rank, timer, and leaderboard updates
   to participant and observer screens.
4. Display company names on leaderboard / roster. Job
   create/publish lives on the external Hirance job server;
   this API scores via webhook matched by `company_id`.

## Core User Flow

1. Admin creates a competition and one or more rounds
   (`x-admin-key`).
2. Companies are registered or self-join with
   `companyId` + `companyName` (`x-event-key`).
3. Admin starts a round. NestJS sets `actualStartAt` /
   `endAt` and broadcasts `ROUND_STARTED`.
4. Next.js clients receive a synchronized timer from
   server time.
5. A company publishes a job on the external job server.
6. That server POSTs a signed event to
   `/api/integrations/job-events` with `company_id`
   (optional `company_name` for display refresh). After
   the ingest transaction commits, score increments by 1
   if receive time is within `[actualStartAt, endAt + 3s]`.
7. Participants may disconnect and reconnect without
   resetting timer or score.
8. After `endAt + 3s`, new publishes are not scored.
   Final scores, deterministic ranking, and winner are
   stored. The leaderboard becomes immutable on finalize.

## Features

### Competition management

- Draft, schedule, start, end, finalize, and cancel rounds
- Participant registration / join by company id + name
- Server-authoritative timer per round
- Winner determination and immutable final results

### Scoring and jobs

- Mirrored `Job` records from external webhooks
- Score = count of successfully published valid jobs
  in the round ledger (`RoundJobScore`)
- Atomic, idempotent score updates
- `postDurationSeconds` = time since previous scored job

### Real-time

- NestJS WebSocket / Socket.IO gateway
- Live score, rank, leaderboard, presence, and end events
- HTTP snapshot for initial load and reconnect recovery

### Dashboards

- Next.js participant competition page (join + score)
- Next.js observer / TV live dashboard
- Optional LiveKit screen sharing (separate from scoring)

### Safety and operations

- Audit trail
- Key-based access (`ADMIN_KEY`, `EVENT_ACCESS_KEY`, HMAC)
- Rate limiting
- Observability and load-test scripts

## Scope

### In Scope

- NestJS competition module, APIs, guards, scoring,
  lifecycle, and WebSocket gateway
- Next.js participant, observer, and live/TV UI
- Prisma 7 + PostgreSQL models, CLI migrations, indexes,
  constraints
- Redis for ephemeral realtime state and Socket.IO
  fan-out
- BullMQ / existing workers for finalization where needed
- Audit events, logging, tests, API and event docs

### Out of Scope

- Local job create / publish pipeline
- User login / JWT / Passport auth
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
4. Disconnect / reconnect restores score, rank, and timer
   without reset.
5. Observer screens update in real time from WebSocket
   push, not polling after every score change.
6. After finalization, scores, ranks, and winner cannot
   change.
7. The full acceptance scenario in `details.md` section 63
   works end to end (with company_id attribution).
