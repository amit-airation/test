# Hirance Live Job Creation Competition

## Overview

Hirance Live Job Creation Competition is a production-grade
real-time feature for HRs, founders, and employers. Each
participant gets a fixed window — initially 5 minutes — to
create and successfully publish as many valid jobs as
possible. The winner is the participant with the highest
number of successfully published competition jobs when the
competition ends.

Drafts, failed validation, failed publishes, deleted jobs,
and incomplete jobs never increase the score.

## Goals

1. Run a timed, server-authoritative live competition
   without trusting client clocks or client scores.
2. Count only successfully published, valid competition
   jobs, with concurrency-safe and idempotent scoring.
3. Push live score, rank, timer, and leaderboard updates
   to participant and observer screens.
4. Keep User and Company names for display on participant
   and observer screens. Job create/publish lives on the
   external Hirance job server; this API scores via webhook.

## Core User Flow

1. Admin creates and schedules a competition.
2. HR / founder / employer participants register or are
   added and join (optionally linking `externalUserId`).
3. Competition starts. NestJS sets `actual_start_at` and
   `end_at` and broadcasts `COMPETITION_STARTED`.
4. All Next.js clients receive a synchronized timer from
   server time.
5. A participant publishes a job on the external job server.
6. That server POSTs a signed event to
   `/api/integrations/job-events`. After the ingest
   transaction commits, the score increments by 1 and
   observers see a live update.
7. Participants may disconnect and reconnect without
   resetting timer or score.
8. At `end_at`, new publishes are rejected. Final scores,
   deterministic ranking, and winner are stored and
   displayed. The leaderboard becomes immutable.

## Features

### Competition management

- Draft, schedule, start, end, finalize, and cancel
- Participant registration and membership checks
- Server-authoritative timer
- Winner determination and immutable final results

### Scoring and jobs

- Reuse the existing Job model with an optional
  `competition` relation
- Score = count of successfully published valid
  competition jobs
- Atomic, idempotent score updates
- Competition-specific validation on top of normal
  Hirance job rules

### Real-time

- NestJS WebSocket / Socket.IO gateway
- Live score, rank, leaderboard, presence, and end events
- HTTP snapshot for initial load and reconnect recovery

### Dashboards

- Next.js participant competition page
- Next.js observer / admin live dashboard
- Full-screen / TV presentation mode
- Optional WebRTC screen sharing (separate from scoring)

### Safety and operations

- Audit trail
- Anti-cheat / abuse controls
- Rate limiting tuned for high-frequency publishing
- Observability and load-test scenario

## Scope

### In Scope

- NestJS competition module, APIs, guards, scoring,
  lifecycle, and WebSocket gateway
- Next.js participant, observer, and live/TV UI
- Prisma 7 + PostgreSQL models, CLI migrations, indexes,
  constraints
- Redis for ephemeral realtime state and Socket.IO
  fan-out
- BullMQ / existing workers for finalization,
  notifications, reconciliation
- Audit events, logging, tests, API and event docs

### Out of Scope

- A second Job model or a second publish pipeline
- Streaming video through NestJS WebSockets
- Treating Redis as the permanent score source
- Putting scoring, timer authority, or publish rules in
  Next.js Route Handlers
- Unrelated Hirance UI or architecture changes
- Microservices unless the existing architecture already
  requires them

## Success Criteria

1. A published competition job increments score by 1 only
   after the NestJS publish transaction commits.
2. A publish after `end_at` is rejected and never counted.
3. Retries and duplicate requests do not double-count a
   job.
4. Disconnect / reconnect restores score, rank, and timer
   without reset.
5. Observer screens update in real time from WebSocket
   push, not polling after every score change.
6. After finalization, scores, ranks, and winner cannot
   change.
7. The full acceptance scenario in `details.md` section 63
   works end to end.
