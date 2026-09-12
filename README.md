# Hirance Live Job Creation Competition

npm workspaces monorepo for the Hirance Live Job Creation Competition.

## Apps

| App | Path | Stack | Port |
| --- | --- | --- | --- |
| API | `apps/api` | NestJS + Prisma 7 + PostgreSQL + Redis/BullMQ | 3001 |
| Web | `apps/web` | Next.js App Router + Tailwind | 3000 |

## Prerequisites

- Node.js 22+ (Nest CLI may warn on other versions)
- Docker Desktop (Postgres 16 + Redis 7)

## Quick start

```bash
docker compose up -d
cp .env.example .env
cp .env.example apps/api/.env   # or copy DATABASE_URL / Redis vars
npm install --legacy-peer-deps
npm run prisma:migrate -w api
npm run prisma:generate -w api
npm run dev:api
npm run dev:web
```

- API health: http://localhost:3001/api/health
- Web: http://localhost:3000

## Notes

- Nest 12 scaffold is ESM. Prisma client is generated to
  `apps/api/src/generated/prisma` with `@prisma/adapter-pg`.
- Competition domain (`live-challenge`) starts in Phase 1.
