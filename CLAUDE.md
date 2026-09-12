## Application Building Context

This repository specifies Hirance Live Job Creation Competition.

Stack: **NestJS** backend, **Next.js** frontend, **Prisma 7 + PostgreSQL**,
Redis, BullMQ (or the existing NestJS queue), WebSockets / Socket.IO.

Generate NestJS modules, controllers, services, gateways, guards, DTOs,
and filters with the Nest CLI (`nest g`). Initialize and migrate the
database with Prisma 7 CLI (`prisma init`, `prisma migrate dev`,
`prisma generate`). Do not hand-roll those files when a CLI exists.
Do not use TypeORM.

Read the following files in order before implementing
or making any architectural decision:

1. `details.md` — full product and technical specification
2. `context/project-overview.md` — product definition,
   goals, features, and scope
3. `context/architecture.md` — system structure,
   boundaries, storage model, and invariants
4. `context/ui-context.md` — theme, colors, typography,
   and component conventions
5. `context/code-standards.md` — implementation rules
   and conventions
6. `context/ai-workflow-rules.md` — development workflow,
   scoping rules, and delivery approach
7. `context/progress-tracker.md` — current phase,
   completed work, open questions, and next steps

`details.md` is the source of truth for competition rules,
scoring, timer authority, APIs, WebSocket events, and
acceptance criteria. Context files summarize and constrain
implementation. If they conflict, follow `details.md` and
then update the context file.

Update `context/progress-tracker.md` after each
meaningful implementation change.

If implementation changes the architecture, scope, or
standards documented in the context files, update the
relevant file before continuing.

Do not invent Django, Celery, Django Admin, or TypeORM patterns.
This product is NestJS + Next.js + Prisma 7 + PostgreSQL.
