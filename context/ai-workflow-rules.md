# AI Workflow Rules

## Approach

Build this feature incrementally against `details.md` and
the files in `context/`.

Inspect the existing Hirance NestJS and Next.js codebase
before writing code. Produce a short architecture
assessment that says where each piece belongs, then
implement only the current phase.

Do not invent Django, Celery, DRF, or Django Admin.
The stack is NestJS + Next.js.

Do not infer product behavior that is not in `details.md`
or these context files.

## Scoping Rules

- Work one phase / feature unit at a time.
- Prefer small, verifiable increments.
- Do not combine unrelated boundaries in one step
  (for example NestJS scoring and Next.js TV chrome).
- Do not implement all eight phases at once.

## Implementation sequence

Follow `details.md` section 60:

1. Domain — entities, lifecycle, job relation, guards,
   admin hooks
2. Competition job flow — join, start, publish, atomic
   score, finalize
3. Real-time — gateway auth, rooms, score/leaderboard
   events, presence, reconnect, timer sync
4. Participant UI — page, countdown, score, rank,
   leaderboard, job form integration
5. Observer UI — live leaderboard, top 3, motion, TV mode
6. Audit / security — events, rate limits, idempotency,
   anti-abuse
7. Optional screen sharing — WebRTC, SFU, grid/focus
8. Production hardening — load tests, failure tests,
   monitoring, indexes, WebSocket capacity

## When to Split Work

Split a step if it combines:

- NestJS domain changes and Next.js visual work
- Scoring / transactions and WebRTC
- Multiple unrelated REST endpoints plus UI
- Behavior not defined in `details.md` or context files

If a change cannot be verified end to end quickly, the
scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior.
- If a requirement is ambiguous, resolve it in the
  relevant context file (and `details.md` if needed)
  before implementing.
- If a requirement is missing, add it as an open question
  in `progress-tracker.md` before continuing.
- Prefer existing Hirance conventions for ORM, auth,
  queues, API envelope, and UI kit when `details.md`
  leaves the exact library open.

## Protected Files

Do not modify unless explicitly instructed:

- Existing Job publish internals beyond the minimum
  competition hook
- Generated UI library components
- Unrelated Hirance modules, routes, or styles
- Third-party library internals
- `.env` secrets

## Keeping Docs in Sync

Update the relevant context file whenever implementation
changes:

- System architecture or boundaries
- Storage model decisions
- Code conventions or standards
- Feature scope
- Current phase / completed work (`progress-tracker.md`)

If context and `details.md` drift, update context to
match `details.md` unless the user explicitly changes
the spec.

## Hard rules during implementation

Never:

- Trust frontend score or timer
- Count job creation as a score
- Increment score before successful publish
- Increment score from a WebSocket message
- Use Redis as the permanent score source
- Stream video through NestJS WebSockets
- Create a duplicate Job model
- Duplicate Job publishing logic
- Allow arbitrary competition IDs
- Allow clients to update score or rank
- Depend only on a worker to expire the competition
- Broadcast before transaction commit
- Let retries double-count a job
- Put authority in Next.js Route Handlers
- Hold sockets in React Server Components

Always:

- Use NestJS server time
- Use PostgreSQL as authoritative state
- Use transactions and idempotency
- Validate permissions in NestJS
- Reuse existing Hirance domain logic
- Keep APIs backward-compatible

## Before Moving to the Next Unit

1. The current unit works end to end in its scope.
2. No invariant in `architecture.md` was violated.
3. `progress-tracker.md` reflects the completed work.
4. Existing NestJS and Next.js test / build commands pass.
5. New competition APIs follow the existing response
   envelope.
